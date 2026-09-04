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

export async function readReservations(): Promise<Reservations> {
  try {
    const raw = await AsyncStorage.getItem(RESERVATIONS_KEY);
    if (!raw) return EMPTY_RESERVATIONS;
    return normalizeReservations(JSON.parse(raw));
  } catch {
    // Un stockage illisible ne doit jamais empecher l'application de s'ouvrir :
    // le calendrier, lui, vient du depot et reste parfaitement utilisable.
    return EMPTY_RESERVATIONS;
  }
}

export async function writeReservations(reservations: Reservations): Promise<void> {
  try {
    await AsyncStorage.setItem(RESERVATIONS_KEY, JSON.stringify(reservations));
  } catch {
    // L'ecriture optimiste a deja mis a jour l'interface. Perdre la
    // persistance d'un creneau est desagreable ; planter dessus le serait plus.
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
