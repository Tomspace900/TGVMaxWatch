/**
 * Configuration partagee entre le collecteur (Node) et la PWA (Vite).
 * Ce fichier est importe des deux cotes : n'y mettre que des constantes
 * serialisables, aucun acces a `process` ni au systeme de fichiers.
 */

/** Repo GitHub, utilise par la PWA pour ecrire via l'API Contents. */
export const REPO_OWNER = 'Tomspace900';
export const REPO_NAME = 'TGVMaxWatch';
export const REPO_BRANCH = 'main';

/** URL publique du site GitHub Pages (sert de base aux liens des notifications). */
export const SITE_URL = 'https://tomspace900.github.io/TGVMaxWatch/';

/**
 * Cle publique VAPID, en base64url : un point P-256 non compresse de 65 octets.
 *
 * Publique par nature — c'est elle que le navigateur envoie au service push
 * pour lier l'abonnement a nous. La cle privee correspondante vit dans le
 * secret repo VAPID_PRIVATE_KEY et ne quitte jamais l'Action ; c'est elle qui
 * fait rejeter en 403 tout envoi qui ne vient pas de ce collecteur, y compris
 * quand l'abonnement est lisible dans un repo public.
 */
export const VAPID_PUBLIC_KEY =
  'BF5x8AumSkkoLwdKJk_A2QsuNUaEXmTxCGWykVyftodr9QZ0JrNW_XI3XzWQXDk2lhPxaFeBJNao3HD_8T629Uc';

/** Codes gares du dataset SNCF. */
export const PARIS = 'FRPMO';
export const BORDEAUX = 'FRBOJ';

/**
 * Les seules gares suivies.
 *
 * Le filtre serveur porte sur les villes, et le dataset renvoie donc aussi des
 * Ouigo Train Classique au depart d'Austerlitz, a plus de cinq heures de
 * trajet. Ce n'est pas le voyage que ce projet surveille : ces lignes sont
 * ecartees des la collecte plutot que de polluer l'archive, les agregats et
 * les notifications.
 */
export const TRACKED_STATIONS = [PARIS, BORDEAUX];

/** Les deux sens suivis. */
export const DIR_PARIS_BORDEAUX = `${PARIS}>${BORDEAUX}`;
export const DIR_BORDEAUX_PARIS = `${BORDEAUX}>${PARIS}`;
export const DIRECTIONS = [DIR_PARIS_BORDEAUX, DIR_BORDEAUX_PARIS] as const;

/** Libelles courts, utilises dans l'UI et dans le corps des notifications. */
export const STATION_LABELS: Record<string, string> = {
  [PARIS]: 'Paris',
  [BORDEAUX]: 'Bordeaux',
};

/** Horizon glissant de la source : aucune vision au-dela de J+30. */
export const HORIZON_DAYS = 30;

/** Retention de `history.json`, en jours avant aujourd'hui (dates de voyage). */
export const HISTORY_RETENTION_DAYS = 120;

/**
 * Paliers de duree de trajet, en minutes.
 * Sur cet axe les temps vont de ~2h05 (direct) a ~3h30 (omnibus).
 */
export const DURATION_DIRECT_MAX = 140; // 2h20
export const DURATION_INTERMEDIATE_MAX = 180; // 3h00

/** Quota de reservations simultanees de l'abonnement TGVmax. */
export const MAX_RESERVATIONS = 6;

/** Nombre de jours avant le voyage ou la reservation doit etre confirmee. */
export const CONFIRM_DAYS_BEFORE = 1;

/** Au-dela, la donnee affichee est consideree comme perimee (collecteur en panne). */
export const STALE_DATA_HOURS = 36;

/**
 * Nombre de snapshots requis avant de publier la moindre prevision.
 * ~8 semaines : en dessous, on affiche les donnees brutes plutot qu'une
 * estimation inventee.
 */
export const MIN_SNAPSHOTS_FOR_STATS = 56;

/**
 * Echelle de disponibilite : borne basse de chaque palier de couleur.
 *
 * Le plan prevoyait 0 / 1-2 / 3-5 / 6+. La premiere collecte reelle montre
 * ~32 trains par jour et par sens sur cet axe, avec des journees a 30 places
 * disponibles : le palier « 6+ » avalait alors la majorite du calendrier et la
 * couleur n'encodait plus rien. Cinq paliers couvrent la plage observee.
 */
export const AVAILABILITY_BUCKETS = [0, 1, 3, 6, 12] as const;
