import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Reservation, Reservations, Watchlist } from '../../../src/types.ts';

/**
 * Etat personnel, garde sur l'appareil.
 *
 * Les reservations disent quand on n'est pas chez soi. Elles vivaient dans un
 * depot public parce que le rappel de confirmation tournait dans une GitHub
 * Action et devait les lire ; ce rappel est desormais une alarme posee par le
 * telephone, et plus rien cote depot n'en a l'usage.
 *
 * La watchlist, elle, reste dans le depot : le collecteur ne peut pas filtrer
 * ses notifications sur un fichier qu'il ne lit pas.
 */
const RESERVATIONS_KEY = 'tgvmax.reservations';

export const EMPTY_RESERVATIONS: Reservations = { slots: [] };

/**
 * Une lecture qui echoue n'est pas une liste vide.
 *
 * C'est la distinction qui manquait, et elle ouvrait une perte definitive :
 * une lecture en erreur rendait une liste vide, l'interface affichait « aucun
 * creneau », et la premiere reservation suivante ecrasait le stockage avec
 * cette liste vide augmentee d'un seul element. Tout le reste disparaissait
 * sans que rien ne l'annonce — le mode de panne que ce projet combat partout
 * ailleurs, place au seul endroit ou la donnee n'est pas reconstituable.
 */
export interface ReservationsRead {
  reservations: Reservations;
  /** Faux quand le stockage n'a pas pu etre lu. L'appelant doit alors refuser d'ecrire. */
  ok: boolean;
}

export async function readReservations(): Promise<ReservationsRead> {
  try {
    const raw = await AsyncStorage.getItem(RESERVATIONS_KEY);
    if (!raw) return { reservations: EMPTY_RESERVATIONS, ok: true };
    return { reservations: normalizeReservations(JSON.parse(raw)), ok: true };
  } catch {
    return { reservations: EMPTY_RESERVATIONS, ok: false };
  }
}

/** Rend `false` si l'ecriture a echoue : l'appelant doit le rendre visible. */
export async function writeReservations(reservations: Reservations): Promise<boolean> {
  try {
    await AsyncStorage.setItem(RESERVATIONS_KEY, JSON.stringify(reservations));
    return true;
  } catch {
    return false;
  }
}

/** Enveloppe d'export, versionnee pour qu'un import sache ce qu'il lit. */
interface ExportBundle {
  kind: 'tgvmax-watch/export';
  version: 1;
  exportedAt: string;
  reservations: Reservations;
  watchlist: Watchlist;
}

/**
 * Sauvegarde manuelle, et manuelle seulement.
 *
 * Rien ne quitte l'appareil sans un geste. Le risque assume est de perdre les
 * creneaux et les rappels programmes si le telephone disparait sans export
 * recent — les reservations elles-memes restent chez SNCF, seule cette copie
 * est perdue.
 */
export function exportLocalState(reservations: Reservations, watchlist: Watchlist): string {
  const bundle: ExportBundle = {
    kind: 'tgvmax-watch/export',
    version: 1,
    exportedAt: new Date().toISOString(),
    reservations,
    watchlist,
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * Relit un export.
 *
 * Le contenu vient d'un fichier choisi par l'utilisateur : on ne suppose rien
 * de sa forme, et un import invalide se refuse au lieu de corrompre l'etat.
 */
export function parseExport(raw: string): { reservations: Reservations; watchlist: Watchlist } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || parsed['kind'] !== 'tgvmax-watch/export') return null;

  const watchlist = parsed['watchlist'];
  return {
    reservations: normalizeReservations(parsed['reservations']),
    watchlist: isRecord(watchlist)
      ? { watch: asArray(watchlist['watch']), rules: asArray(watchlist['rules']) }
      : { watch: [], rules: [] },
  };
}

/**
 * Ne garde que les creneaux complets.
 *
 * Une entree amputee d'un champ traverserait l'application jusqu'a l'ecran qui
 * l'affiche ; la refuser ici coute une ligne et evite d'avoir a s'en mefier
 * partout ailleurs.
 */
function normalizeReservations(value: unknown): Reservations {
  if (!isRecord(value)) return EMPTY_RESERVATIONS;
  const slots: Reservation[] = [];

  for (const entry of asArray<unknown>(value['slots'])) {
    if (!isRecord(entry)) continue;
    const { date, dir, trainNo, depart, arrivee, bookedAt, confirmed } = entry;
    if (
      typeof date !== 'string' ||
      typeof dir !== 'string' ||
      typeof trainNo !== 'string' ||
      typeof depart !== 'string' ||
      typeof arrivee !== 'string'
    ) {
      continue;
    }
    slots.push({
      date,
      dir,
      trainNo,
      depart,
      arrivee,
      bookedAt: typeof bookedAt === 'string' ? bookedAt : date,
      confirmed: confirmed === true,
    });
  }

  return { slots };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
