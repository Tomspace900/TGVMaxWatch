import AsyncStorage from '@react-native-async-storage/async-storage';
import { NoTokenError, hasToken, readFile, writeFile } from './github.ts';
import type { Written } from './github.ts';
import { parseWatchlist } from '../../../src/watchlist.ts';
import type { Watchlist } from '../../../src/types.ts';

/**
 * La watchlist a deux domiciles, et un seul auteur.
 *
 * Le depot est celui que le collecteur lit : il ne peut pas filtrer ses
 * notifications sur un fichier qu'il ne connait pas, et c'est pour ca que la
 * watchlist y reste. Mais le depot etait aussi la *source* affichee, lue par
 * `raw.githubusercontent.com` — un CDN a `max-age=300`. Une suppression
 * partait bien, et le rechargement suivant la faisait revenir pendant cinq
 * minutes. Ajoute a une ecriture muette et non serialisee, ca donnait le
 * desordre observe : des entrees qui manquent, d'autres qui ressuscitent.
 *
 * L'appareil est desormais l'auteur, et le depot une publication. Le miroir
 * local est ce que l'ecran affiche ; la publication est une consequence, qui
 * peut echouer, retarder, ou attendre un jeton — sans que la liste bouge.
 *
 * Le collecteur, lui, ne reecrit jamais ce fichier : il ne fait que le lire.
 * C'est ce qui permet a l'appareil d'etre autoritaire sans arbitrage.
 */
const KEY = 'tgvmax.watchlist';

const PATH = 'watchlist.json';

/**
 * Vide et jamais ecrit ne sont pas la meme chose.
 *
 * C'est la lecon deja payee sur les reservations. Un miroir absent doit se
 * remplir depuis le depot ; un miroir vide est une liste que quelqu'un a
 * vraiment videe, et la remplacer par celle du depot ferait revenir tout ce
 * qu'on vient de retirer.
 */
export interface LocalWatchlist {
  /** `null` quand rien n'a jamais ete enregistre sur cet appareil. */
  watchlist: Watchlist | null;
  /** Vrai quand une edition locale n'a pas encore atteint le depot. */
  pending: boolean;
  /** Faux quand le stockage n'a pas pu etre lu : l'appelant doit refuser d'ecrire. */
  ok: boolean;
}

interface Stored {
  watchlist: unknown;
  pending?: boolean;
}

export async function readLocalWatchlist(): Promise<LocalWatchlist> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { watchlist: null, pending: false, ok: true };

    const stored = JSON.parse(raw) as Stored;
    return {
      watchlist: parseWatchlist(stored.watchlist),
      pending: stored.pending === true,
      ok: true,
    };
  } catch {
    return { watchlist: null, pending: false, ok: false };
  }
}

async function writeLocal(watchlist: Watchlist, pending: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ watchlist, pending } satisfies Stored));
  } catch {
    // Le miroir est un confort de redemarrage ; la session en cours tient sans.
  }
}

/**
 * Etat de la publication, tel qu'un ecran doit pouvoir le dire.
 *
 * Le silence est le mode de panne de ce projet : une edition qui n'atteint pas
 * le depot n'est pas perdue, mais le collecteur ne la voit pas et aucune alerte
 * ne partira sur ce creneau. Ca ne peut pas rester invisible.
 */
export type SyncState = 'synced' | 'pending' | 'failed' | 'no-token';

let state: SyncState = 'synced';
let desired: { value: Watchlist; message: string } | null = null;
let running = false;

const listeners = new Set<(next: SyncState) => void>();

export function subscribeSync(listener: (next: SyncState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function syncState(): SyncState {
  return state;
}

/** Vrai des qu'une edition locale n'est pas encore publiee. */
export function isPending(): boolean {
  return desired !== null || state !== 'synced';
}

function setState(next: SyncState): void {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener(next);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Une seule ecriture en vol, et seule la derniere valeur compte.
 *
 * `writeFile` relit le `sha` puis envoie : deux appels concurrents se
 * marchaient dessus et le perdant repartait en 409 avale par un `catch` vide.
 * La file les serialise, et comme chaque envoi porte l'etat complet et non un
 * increment, les editions accumulees pendant une ecriture se replient en une
 * seule — celle qui est vraie.
 */
export function publishWatchlist(value: Watchlist, message: string): void {
  desired = { value, message };
  setState('pending');
  void writeLocal(value, true);
  void run();
}

/**
 * Marque une edition avant meme qu'elle ne soit publiee.
 *
 * La publication est un effet du changement d'etat, donc elle arrive apres le
 * rendu ; entre le geste et cet effet, un rafraichissement lance plus tot
 * pouvait rendre sa reponse et adopter la version du depot. Le geste etait
 * annule sans que rien ne le dise. Le marqueur, lui, se pose dans le geste :
 * `resolveWatchlist` le voit forcement.
 */
export function markPending(): void {
  setState('pending');
}

/** Rejoue ce qui attend encore. Appele a chaque rafraichissement. */
export function retrySync(): void {
  if (desired) void run();
}

async function run(): Promise<void> {
  if (running) return;
  running = true;

  try {
    while (desired) {
      const job = desired;
      const published = await publish(job.value, job.message);

      if (!published) return;
      // Une edition arrivee pendant l'envoi rend celui-ci caduc : on reboucle
      // sur la derniere valeur plutot que de declarer synchronise un etat
      // qui ne l'est plus.
      if (desired !== job) continue;

      desired = null;
      setState('synced');
      await writeLocal(job.value, false);
    }
  } finally {
    running = false;
  }
}

/**
 * Les etats du fichier que nos propres ecritures ont deja remplaces.
 *
 * Sert a reconnaitre une lecture perimee : une reponse qui porte l'un de ces
 * `sha` est un cache en retard, pas une edition venue d'ailleurs — elle serait
 * passee par ici. L'en-tete `no-cache` sur l'API devrait suffire, mais c'est
 * exactement ce qu'on croyait du CDN, et deux fois de suite la supposition a
 * coute un suivi disparu a l'ecran. Un `sha` ne suppose rien.
 *
 * Un ensemble et non le dernier `sha` : deux editions rapprochees empilent deux
 * etats remplaces, et une reponse en retard peut porter le plus ancien des
 * deux. Ne surveiller que le plus recent laissait passer l'autre.
 *
 * En memoire seulement : passe le redemarrage, le depot porte deja notre
 * contenu et il n'y a plus de retard a rattraper.
 */
const superseded = new Set<string>();

function remember(written: Written): void {
  if (written.previous) superseded.add(written.previous);
  // Notre propre resultat n'est pas un etat remplace : le relire est la preuve
  // qu'on est a jour, pas le symptome d'un retard.
  superseded.delete(written.sha);
}

/** Rend faux quand il faut s'arreter : l'etat porte alors la raison. */
async function publish(value: Watchlist, message: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      remember(await writeFile(PATH, value, message));
      return true;
    } catch (error) {
      if (error instanceof NoTokenError) {
        setState('no-token');
        return false;
      }
      if (attempt === 2) {
        setState('failed');
        return false;
      }
      await delay(1000 * 2 ** attempt);
    }
  }
  return false;
}

/**
 * La version du depot, lue la ou elle est juste.
 *
 * Par l'API quand un jeton existe — elle repond depuis la ref et voit le commit
 * des qu'il est fait. Les trois issues sont distinctes et doivent le rester :
 * une lecture ratee n'est ni une liste vide, ni l'absence de jeton, et les
 * confondre etait la faute d'origine.
 */
type RepoRead =
  | { kind: 'ok'; value: Watchlist; sha: string }
  | { kind: 'no-token' }
  | { kind: 'error' };

async function readRepoWatchlist(): Promise<RepoRead> {
  if (!(await hasToken())) return { kind: 'no-token' };
  try {
    const file = await readFile<unknown>(PATH);
    if (file === null) return { kind: 'error' };
    const value = parseWatchlist(file.value);
    return value === null ? { kind: 'error' } : { kind: 'ok', value, sha: file.sha };
  } catch {
    return { kind: 'error' };
  }
}

/**
 * Ce que l'application doit afficher au demarrage et a chaque rafraichissement.
 *
 * L'ordre est la regle, et il se lit de haut en bas :
 *
 * 1. une edition non publiee gagne toujours — c'est la seule chose qui empeche
 *    un rafraichissement d'annuler un geste, et elle survit a la fermeture de
 *    l'application ;
 * 2. une reponse du depot qui porte un `sha` que nos propres ecritures ont deja
 *    remplace est un cache en retard : on la laisse passer ;
 * 3. sinon le depot lu par l'API, qui fait foi ;
 * 4. sans jeton seulement, une lecture reseau fraiche du fichier public ;
 * 5. sinon le miroir, puis le cache.
 *
 * Une lecture ratee n'apparait nulle part dans cette liste : elle n'est pas une
 * liste vide, elle laisse en place ce qu'on avait deja. Et quand un jeton
 * existe, le fichier public n'est jamais adopte — il peut avoir cinq minutes de
 * retard, et l'API est disponible pour dire mieux.
 */
export async function resolveWatchlist(remote: {
  value: Watchlist;
  /** Vrai quand la valeur vient du reseau maintenant, et non du cache. */
  fresh: boolean;
}): Promise<{ watchlist: Watchlist; ok: boolean }> {
  const local = await readLocalWatchlist();
  const keep = (watchlist: Watchlist) => ({ watchlist, ok: local.ok });

  if (local.pending && local.watchlist) {
    if (!isPending()) publishWatchlist(local.watchlist, 'watchlist: reprise apres redemarrage');
    return keep(local.watchlist);
  }

  if (isPending() && local.watchlist) return keep(local.watchlist);

  const repo = await readRepoWatchlist();

  if (repo.kind === 'ok') {
    if (superseded.has(repo.sha) && local.watchlist) {
      // Le depot nous rend un etat que nous avons nous-memes remplace : ce ne
      // peut pas etre une edition venue d'ailleurs, elle serait passee par ici.
      return keep(local.watchlist);
    }
    // Cette reponse est au moins aussi recente que tout ce qu'on a ecrit : ce
    // qui la precede ne peut plus revenir, et n'a plus a etre surveille.
    superseded.clear();
    await writeLocal(repo.value, false);
    return keep(repo.value);
  }

  if (repo.kind === 'no-token' && remote.fresh) {
    await writeLocal(remote.value, false);
    return keep(remote.value);
  }

  if (local.watchlist) return keep(local.watchlist);
  return keep(remote.value);
}
