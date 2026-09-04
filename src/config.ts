/**
 * Configuration partagee entre le collecteur (Node) et la PWA (Vite).
 * Ce fichier est importe des deux cotes : n'y mettre que des constantes
 * serialisables, aucun acces a `process` ni au systeme de fichiers.
 */

/** Repo GitHub, utilise par la PWA pour ecrire via l'API Contents. */
export const REPO_OWNER = 'Tomspace900';
export const REPO_NAME = 'TGVMaxWatch';
export const REPO_BRANCH = 'main';

/**
 * Lien porte par une notification.
 *
 * Le schema de l'application, et non plus une URL web : le site qui servait la
 * PWA n'existe plus, et ce lien n'est de toute facon lu que par l'application,
 * qui en extrait la date et le sens pour ouvrir directement le bon jour.
 */
export const APP_URL = 'tgvmax://day';

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

/**
 * Nombre de jours avant le voyage ou la reservation doit etre confirmee.
 *
 * L'echeance retenue est 17h la veille du voyage. Elle vient de l'utilisateur,
 * pas d'une source SNCF verifiable : tout le rappel repose dessus, et c'est la
 * seule ligne a changer si elle se revele fausse.
 */
export const CONFIRM_DAYS_BEFORE = 1;

/**
 * Heure locale a laquelle le telephone pose le rappel de confirmation.
 *
 * Sept heures avant l'echeance de 17h. Le rappel est une alarme posee par
 * l'appareil, dont l'heure locale est celle de l'utilisateur : contrairement au
 * cron qu'il remplace, il ne peut pas arriver en retard ni se retirer en
 * silence.
 */
export const CONFIRM_REMINDER_HOUR = 10;

/**
 * Ou se confirme une reservation.
 *
 * L'espace MAX JEUNE, et non `sncf-connect.com/app/mes-voyages` vers lequel le
 * rappel pointait : c'est la page ou le geste demande se fait reellement.
 */
export const CONFIRM_URL = 'https://www.maxjeune-tgvinoui.sncf/sncf-connect/mes-voyages';

/** Au-dela, la donnee affichee est consideree comme perimee (collecteur en panne). */
export const STALE_DATA_HOURS = 36;

/**
 * Seuils des deux alertes qui ne dependent d'aucune preference.
 *
 * Mesures sur l'archive reelle, diff du 01 au 03 septembre : notifier chaque
 * train qui s'ouvre produit 12 a 13 lignes par jour, soit un message tronque
 * quotidien et un canal mort en trois semaines. Ces deux regles-la en donnent
 * une a quatre, toutes actionnables.
 *
 * `REOPEN_MIN_TRAINS` filtre l'amplitude : une date entre dans la fenetre a
 * zero place — les quatre mesurees sont entrees a 0/35, 0/39, 0/33 et 0/29 —
 * puis se remplit le lendemain. Elle se remplit de dix trains ou d'un seul, et
 * seul le premier cas est une nouvelle.
 *
 * `DRAIN_MAX_LEFT` croise la vitesse et la rarete : un creneau qui fond alors
 * qu'il en reste vingt n'a rien d'urgent, et un creneau qui passe de 1 a 0 est
 * deja perdu. C'est entre les deux que l'information a de la valeur.
 *
 * A retoucher en octobre, avec un vrai recul.
 */
export const REOPEN_MIN_TRAINS = 5;
export const DRAIN_MIN_DROP = 3;
export const DRAIN_MAX_LEFT = 3;

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
