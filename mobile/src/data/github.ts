import * as SecureStore from 'expo-secure-store';
import { REPO_BRANCH, REPO_NAME, REPO_OWNER } from '../../../src/config.ts';

const API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const TOKEN_KEY = 'tgvmax_pat';

/**
 * Ecriture depuis le telephone.
 *
 * Le jeton vit dans le keystore Android via SecureStore, et non dans un simple
 * stockage cle-valeur : c'est un PAT avec droit d'ecriture sur le depot, et
 * c'est le seul endroit du projet ou un secret se trouve sur l'appareil.
 */
export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Keystore indisponible : l'application reste utilisable en lecture.
  }
}

export type TokenCheck =
  | { ok: true; scope: 'write' }
  | { ok: false; reason: 'invalid' | 'no-access' | 'read-only' | 'network' };

/**
 * Verifie un jeton avant de l'enregistrer.
 *
 * Un PAT mal colle — tronque, avec un espace, expire, ou cree sur le mauvais
 * depot — se comportait exactement comme un jeton absent : l'ecriture echouait
 * en silence et l'edition ne survivait pas au rafraichissement suivant. Une
 * seule requete tranche les quatre cas, et le droit d'ecriture se lit dans la
 * reponse au lieu d'etre suppose.
 */
export async function verifyToken(token: string): Promise<TokenCheck> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, {
      headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (response.status === 401) return { ok: false, reason: 'invalid' };
  if (response.status === 403 || response.status === 404) {
    // Un PAT fine-grained qui ne porte pas sur ce depot le rend invisible : 404
    // ne veut pas dire « n'existe pas », mais « pas pour ce jeton ».
    return { ok: false, reason: 'no-access' };
  }
  if (!response.ok) return { ok: false, reason: 'network' };

  const repo = (await response.json()) as { permissions?: { push?: boolean } };
  if (!repo.permissions?.push) return { ok: false, reason: 'read-only' };

  return { ok: true, scope: 'write' };
}

function encodeBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function decodeBase64(input: string): string {
  const binary = globalThis.atob(input.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Aucun jeton enregistre.
 *
 * Ce cas n'est pas une panne : c'est une application qui n'a jamais recu de
 * quoi ecrire. Il se distingue de tous les autres parce qu'il ne se resout pas
 * en reessayant, et parce que c'est le seul dont la reponse tient en un ecran
 * — d'ou un type plutot qu'un message parmi d'autres.
 */
export class NoTokenError extends Error {
  constructor() {
    super('Aucun jeton GitHub enregistre');
    this.name = 'NoTokenError';
  }
}

export function hasToken(): Promise<boolean> {
  return getToken().then((token) => token !== null && token !== '');
}

/**
 * `cache-control: no-cache`, et ce n'est pas la meme histoire que le CDN.
 *
 * React Native installe un cache de reponses OkHttp de 10 Mo, et l'API GitHub
 * repond `cache-control: private, max-age=60` : une lecture faite dans la
 * minute qui suit une ecriture etait resservie depuis le disque du telephone,
 * sans requete. Le suivi qu'on venait de poser disparaissait au
 * rafraichissement et revenait une minute plus tard, a la seconde pres.
 *
 * Contre un cache *client*, la directive de requete marche — c'est un cache
 * dont on est le proprietaire, et `no-cache` lui demande de revalider avant de
 * servir. Contre un intermediaire comme le CDN de `raw.githubusercontent.com`,
 * elle ne peut rien : c'est toute la difference, et elle explique pourquoi
 * `remote.ts` portait deja cet en-tete sans que le probleme soit resolu pour
 * autant. `no-cache` plutot que `no-store` : la revalidation par `ETag` rend un
 * 304 quand rien n'a bouge, qui ne compte meme pas dans le quota.
 *
 * Ca valait aussi pour l'ecriture : `writeFile` relit le `sha` avant chaque
 * PUT, et ce `sha` etait mis en cache comme le reste. Deux editions a moins
 * d'une minute d'intervalle partaient donc avec un `sha` perime, et se
 * faisaient refuser en 409 — trois fois de suite, puisque chaque tentative
 * relisait le meme cache.
 */
async function request(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  if (!token) throw new NoTokenError();

  return fetch(`${API}/${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'cache-control': 'no-cache',
      ...init?.headers,
    },
  });
}

/**
 * Lecture par l'API, et c'est tout l'interet.
 *
 * `raw.githubusercontent.com` est servi par un CDN avec `max-age=300` : apres
 * une ecriture, il reste jusqu'a cinq minutes a resservir le blob d'avant, et
 * l'en-tete `cache-control: no-cache` de la requete n'y change rien — c'est un
 * en-tete de requete, il ne perce pas le cache d'un intermediaire. C'est ce
 * decalage qui faisait revenir un suivi supprime au rechargement suivant.
 * L'API Contents, elle, repond depuis la ref : elle voit le commit des qu'il
 * existe.
 *
 * Un cache-buster sur l'URL raw aurait pu suffire, mais il repose sur une
 * propriete du CDN que rien ne nous garantit ; ici le jeton existe deja, et
 * cette lecture est celle dont on a besoin qu'elle soit juste.
 */
export async function readFile<T>(path: string): Promise<{ value: T; sha: string } | null> {
  const response = await request(`${path}?ref=${REPO_BRANCH}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub a repondu ${response.status} sur ${path}`);

  const payload = (await response.json()) as { sha: string; content: string };
  return { value: JSON.parse(decodeBase64(payload.content)) as T, sha: payload.sha };
}

/**
 * Ce qu'une ecriture laisse derriere elle.
 *
 * Les deux `sha` sont ce qui permet, plus tard, de reconnaitre une lecture
 * perimee : une reponse qui porte encore le `sha` d'avant notre ecriture n'est
 * pas une edition venue d'ailleurs, c'est un cache en retard. Sans eux, les
 * deux cas sont indiscernables — et c'est le genre de distinction qu'on ne peut
 * pas fonder sur une supposition quant au comportement d'un cache.
 */
export interface Written {
  /** `sha` du contenu ecrit. */
  sha: string;
  /** `sha` d'avant, ou `null` si le fichier n'existait pas. */
  previous: string | null;
}

/**
 * Ecrit un fichier du depot, en retentant sur conflit.
 *
 * Le `sha` courant est relu juste avant l'envoi : le collecteur commite deux
 * fois par jour et une ecriture depuis le telephone doit pouvoir se glisser
 * entre les deux. Mais relire puis ecrire n'est pas atomique, et deux gestes
 * rapproches suffisaient a produire un 409 — que l'appelant avalait en
 * silence, perdant l'edition pour toujours. Le conflit dit exactement une
 * chose : le `sha` a bouge. On le relit et on rejoue, l'etat envoye etant
 * complet et non un increment.
 */
export async function writeFile(
  path: string,
  value: unknown,
  message: string,
): Promise<Written> {
  const content = encodeBase64(`${JSON.stringify(value, null, 2)}\n`);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await readFile<unknown>(path);

    const response = await request(path, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content,
        branch: REPO_BRANCH,
        ...(existing ? { sha: existing.sha } : {}),
      }),
    });

    if (response.ok) {
      const payload = (await response.json()) as { content?: { sha?: string } };
      return { sha: payload.content?.sha ?? '', previous: existing?.sha ?? null };
    }
    if (response.status !== 409 && response.status !== 422) {
      throw new Error(`Ecriture refusee sur ${path} (HTTP ${response.status})`);
    }
  }

  throw new Error(`Ecriture sur ${path} abandonnee apres trois conflits`);
}
