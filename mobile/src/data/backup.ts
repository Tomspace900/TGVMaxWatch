import { Directory, File } from 'expo-file-system';
import type { PickSingleFileResult } from 'expo-file-system';
import { todayInParis } from '../../../src/dates.ts';
import { exportLocalState, parseExport } from './local.ts';
import type { Reservations, Watchlist } from '../../../src/types.ts';

/**
 * La sauvegarde passe par les fichiers du telephone, pas par le presse-papier.
 *
 * L'export partageait le JSON en texte et la restauration se collait dans un
 * champ : ca marche, mais ca demande de traiter sa propre sauvegarde comme un
 * message — la retrouver dans une conversation des mois plus tard, la
 * selectionner en entier sans en perdre la fin. Pour la seule donnee de cette
 * application qui ne se reconstitue pas depuis l'archive, c'est trop fragile.
 *
 * Et ca ne coute rien : `expo-file-system` est deja dans le binaire — il sert au
 * cache hors ligne — et porte `File.pickFileAsync` et
 * `Directory.pickDirectoryAsync`, qui sont les selecteurs du systeme. Verifie
 * avant d'ecrire une ligne : `expo-document-picker` faisait passer l'empreinte
 * native de `0a2596bb` a `e500879e`, donc un APK de ~108 Mo et une installation
 * qui cesse de recevoir les mises a jour en attendant. Le meme ecran pour zero
 * octet de natif en plus.
 */

export type BackupResult =
  | { kind: 'ok'; label: string }
  /** L'utilisateur est ressorti du selecteur. Ce n'est pas une erreur. */
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/**
 * Ecrit la sauvegarde dans un dossier choisi par l'utilisateur.
 *
 * `pickDirectoryAsync` rejette aussi bien quand on annule que quand il echoue,
 * et ne permet pas de distinguer les deux. On tranche par la position : tant
 * qu'on n'a pas de dossier, un rejet est un renoncement et ne dit rien ; une
 * fois le dossier obtenu, un rejet est une vraie panne et se dit.
 */
export async function exportToFile(
  reservations: Reservations,
  watchlist: Watchlist,
): Promise<BackupResult> {
  let directory: Directory;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch {
    return { kind: 'cancelled' };
  }

  const name = `tgvmax-${todayInParis()}.json`;

  try {
    const file = new File(directory, name);
    if (!file.exists) file.create({ overwrite: true });
    file.write(exportLocalState(reservations, watchlist));
    return { kind: 'ok', label: name };
  } catch (error) {
    return { kind: 'error', message: `Écriture impossible : ${(error as Error).message}` };
  }
}

/**
 * Relit une sauvegarde choisie dans les fichiers du telephone.
 *
 * Aucun filtre de type : une sauvegarde passee par une messagerie ou un espace
 * de stockage revient souvent en `application/octet-stream`, et filtrer sur
 * `application/json` la rendrait invisible dans le selecteur — sans rien dire,
 * evidemment. C'est le contenu qui tranche, et `parseExport` refuse deja tout
 * ce qui n'est pas une sauvegarde de cette application.
 */
export async function importFromFile(): Promise<
  BackupResult & { data?: { reservations: Reservations; watchlist: Watchlist } }
> {
  // Le type explicite plutot qu'un `ReturnType` : `pickFileAsync` est surchargee
  // trois fois, dont une signature depreciee, et l'inference retient la
  // derniere — celle qui rend un `File` nu, sans `canceled`.
  let picked: PickSingleFileResult;
  try {
    picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  } catch {
    return { kind: 'cancelled' };
  }

  if (picked.canceled || !picked.result) return { kind: 'cancelled' };

  let raw: string;
  try {
    raw = picked.result.textSync();
  } catch (error) {
    return { kind: 'error', message: `Lecture impossible : ${(error as Error).message}` };
  }

  const parsed = parseExport(raw);
  if (!parsed) {
    return {
      kind: 'error',
      message: 'Ce fichier n’est pas une sauvegarde TGVmax. Rien n’a été modifié.',
    };
  }

  return { kind: 'ok', label: picked.result.name, data: parsed };
}
