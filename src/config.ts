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
 * Heure limite de confirmation, heure locale francaise.
 *
 * Passe cette heure la veille du voyage, une reservation MAX JEUNE non
 * confirmee est perdue. C'est la seule echeance de ce projet qui coute quelque
 * chose de reel, et elle vivait jusqu'ici en prose et dans le titre d'une
 * notification. Elle est ici parce qu'un compte a rebours l'affiche desormais :
 * une echeance dupliquee dans trois chaines finit toujours par diverger.
 *
 * Elle vient de l'utilisateur, pas d'une source SNCF verifiable : c'est la
 * seule ligne a changer si elle se revele fausse.
 */
export const CONFIRM_DEADLINE_HOUR = 17;

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
 * Heure locale du dernier rappel de confirmation.
 *
 * Deux heures avant l'echeance. Le rappel de 10 h donne sept heures de marge,
 * ce qui est exactement ce qu'on lui demande — mais il ne part qu'une fois, et
 * une notification vue a 10 h dans un couloir n'existe plus a 16 h. Le cout
 * d'un second message est qu'on le balaie ; le cout de son absence est une
 * place perdue.
 *
 * Le libelle du second dit qu'il est le dernier : deux messages identiques se
 * lisent comme un doublon, et on cesse de lire le second.
 */
export const CONFIRM_LAST_CALL_HOUR = 15;

/**
 * Filet des reservations tardives, en minutes avant l'echeance.
 *
 * Un creneau enregistre la veille apres 15 h ne recevait **aucun** rappel :
 * les deux instants prevus etaient passes, et le code se retirait en silence
 * alors qu'il restait des heures pour agir. C'est le mode de panne de ce
 * projet, joue sur la seule chose qui coute de l'argent.
 *
 * Ce rappel-la ne s'ajoute pas aux deux autres, il les remplace quand il ne
 * reste plus qu'eux — sinon une reservation posee trois jours a l'avance
 * recevrait trois messages le meme jour.
 */
export const CONFIRM_LAST_MINUTES_BEFORE = 15;

/**
 * Ou se confirme une reservation.
 *
 * L'espace MAX JEUNE, et non `sncf-connect.com/app/mes-voyages` vers lequel le
 * rappel pointait : c'est la page ou le geste demande se fait reellement.
 */
export const CONFIRM_URL = 'https://www.maxjeune-tgvinoui.sncf/sncf-connect/mes-voyages';

/**
 * Ou se reserve un train.
 *
 * L'application n'a jamais su reserver et ne saura jamais : elle amene a la
 * bonne date, la reservation se fait chez SNCF. Le balayage l'y emmene donc
 * pour de bon, au lieu de le laisser rouvrir l'autre application a la main.
 *
 * L'accueil et rien de plus : aucun format de lien profond portant un trajet et
 * une date n'est publie par SNCF Connect, et en inventer un donnerait une page
 * d'erreur le jour ou il changerait — en silence, comme toujours ici. Sur
 * Android, ce lien `https` est pris par l'application SNCF Connect si elle est
 * installee, et par le navigateur sinon : c'est le meme lien qui sert les deux
 * cas, sans schema maison a maintenir.
 */
export const BOOKING_URL = 'https://www.sncf-connect.com';

/**
 * Fenetre pendant laquelle une reservation peut etre confirmee.
 *
 * La confirmation n'ouvre que 48 h avant le depart : rappeler plus tot n'aide
 * pas, ca demande une action encore impossible. C'est ce qui borne l'apparition
 * de la carte de confirmation, et non plus une distance a l'echeance.
 */
export const CONFIRM_WINDOW_HOURS = 48;

/**
 * Delai apres lequel une entree de surveillance passee cesse d'exister.
 *
 * Le train est parti : la ligne ne dit plus rien, et la liste s'allongerait
 * indefiniment. Une heure de grace parce qu'un depart tout juste passe peut
 * encore etre celui qu'on regarde — un retard, un quai, une correspondance.
 */
export const WATCH_GRACE_HOURS = 1;

/** Au-dela, la donnee affichee est consideree comme perimee (collecteur en panne). */
export const STALE_DATA_HOURS = 36;

/**
 * Delai apres lequel l'appareil s'alarme lui-meme d'une collecte muette.
 *
 * Le silence est le mode de panne de ce projet : un workflow qui ne se
 * declenche pas n'envoie aucun mail d'echec, et la collecte du 2026-09-03 a
 * ainsi disparu sans un seul run rouge. Une notification push ne peut pas
 * combler ce trou — elle est envoyee *par* le collecteur, et un collecteur mort
 * ne peut pas annoncer sa propre mort.
 *
 * L'appareil, lui, le peut : il repose une alarme locale a chaque
 * rafraichissement reussi. Quatre heures de marge au-dela du bandeau de
 * fraicheur, pour qu'un retard de cron ne la declenche pas pour rien.
 */
export const STALE_ALARM_HOURS = 40;

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
 * Rejoues sur l'archive apres le passage de la rame au depart : les seuils
 * tiennent tels quels. Sur les six paires de snapshots disponibles, les deux
 * unites tirent les memes signaux a une exception pres — le 16/09 Paris >
 * Bordeaux, 6 -> 3 rames, qui declenchait `DRAINING`, est 5 -> 3 departs et ne
 * le declenche plus. C'est le bon comportement : une des trois rames perdues
 * doublait un depart dont l'autre rame est restee ouverte, et le signal
 * annoncait donc une perte plus grande que la realite.
 *
 * A retoucher en octobre, avec un vrai recul.
 */
export const REOPEN_MIN_TRAINS = 5;
export const DRAIN_MIN_DROP = 3;
export const DRAIN_MAX_LEFT = 3;

/**
 * Seuils des alertes de creneau suivi.
 *
 * Les trois seuils precedents sont calibres sur une journee entiere, ou une
 * (date, sens) porte une trentaine de trains. Un creneau suivi — « les jeudis
 * matin » — en porte une poignee, et les reutiliser tels quels rendrait ses
 * alertes muettes.
 *
 * Mesure sur l'archive, tous creneaux du calendrier confondus : **un creneau est
 * vide la plupart du temps** — 65 % a midi, 63 % le soir, 56 % l'apres-midi,
 * 39 % le matin. « Il s'ouvre » est donc l'evenement frequent et utile, et c'est
 * pourquoi un seul train suffit a le declencher : ce qu'on veut savoir, c'est
 * que le creneau devient possible, pas qu'il devient confortable.
 *
 * Le compte doit porter sur **tous** les trains du creneau, ouverts ou non,
 * sinon un creneau a zero n'a pas de cle et la transition ne peut litteralement
 * jamais etre observee — c'est l'erreur exacte que `filterNewDates` avait deja
 * faite a l'echelle de la date.
 *
 * Cote fonte, les transitions mesurees sont surtout des pertes de 1 (108 fois
 * sur 1 440 observations) ; exiger 2 et n'en laisser que 2 ramene le signal a
 * ce qui decide vraiment.
 *
 * Mesure refaite en departs : les taux de vide sont **identiques au point de
 * pourcentage pres**, et la distribution des baisses aussi. Le repli ne touche
 * presque pas le compte d'ouverts d'un creneau, parce que les deux rames d'un
 * meme depart divergent rarement en eligibilite. Les seuils tiennent donc sans
 * retouche. A revoir en octobre, avec un vrai recul.
 */
export const SLOT_OPEN_MIN_TRAINS = 1;
export const SLOT_DRAIN_MIN_DROP = 2;
export const SLOT_DRAIN_MAX_LEFT = 2;

/**
 * Amplitude minimale d'une courbe d'erosion, en jours.
 *
 * Il n'y a plus de seuil global sur le nombre de snapshots : chaque
 * statistique porte sa propre garde, et un compteur unique cale sur huit
 * semaines retenait une courbe lisible des le premier mois. Celle-ci demande
 * qu'une courbe couvre reellement la fenetre avant de s'appeler « erosion » —
 * trois points colles a J-0 n'en sont pas une.
 */
export const MIN_EROSION_SPAN = 24;

/**
 * Nombre de dates de collecte conservees dans `data/trains.json`.
 *
 * Un mois de recul par train : au-dela, la tendance recente se noie, et le
 * fichier est relu en entier par l'application a chaque ouverture.
 */
export const TRAIN_TREND_DAYS = 30;

/**
 * Echelle de disponibilite : borne basse de chaque palier de couleur.
 *
 * Le plan prevoyait 0 / 1-2 / 3-5 / 6+. La premiere collecte reelle montre
 * ~32 trains par jour et par sens sur cet axe, avec des journees a 30 places
 * disponibles : le palier « 6+ » avalait alors la majorite du calendrier et la
 * couleur n'encodait plus rien. Cinq paliers couvrent la plage observee.
 */
export const AVAILABILITY_BUCKETS = [0, 1, 3, 6, 12] as const;
