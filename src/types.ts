/** Sens de circulation, sous la forme `<iata origine>><iata destination>`. */
export type Dir = string;

export type Availability = 'OUI' | 'NON';

/** Une ligne du dataset SNCF, apres normalisation. */
export interface TrainRecord {
  /** Date locale de voyage, `YYYY-MM-DD`. Ne jamais convertir en UTC. */
  date: string;
  train_no: string;
  origine_iata: string;
  destination_iata: string;
  /** `HH:MM` local. */
  heure_depart: string;
  heure_arrivee: string;
  od_happy_card: Availability;
  /** Transporteur : `TGV INOUI`, `OUIGO`, `INTERCITES`. Absent si non publie. */
  entity?: string;
}

export type Snapshot = TrainRecord[];

/** Etat du collecteur, egalement lu par la PWA comme fichier de meta. */
export interface State {
  /** `metas.default.data_processed` de la derniere collecte retenue. */
  dataProcessed: string | null;
  /** Instant ou le collecteur a ecrit ce snapshot. */
  collectedAt: string | null;
  /** Date du dernier envoi push reussi, affichee dans l'application. */
  lastPushOk: string | null;
  /** Date de collecte du dernier snapshot, `YYYY-MM-DD`. */
  latestSnapshot: string | null;
  snapshotCount: number;
  recordCount: number;
}

/** Une observation d'une date de voyage, faite un jour de collecte donne. */
export interface Observation {
  /** Date de collecte, `YYYY-MM-DD`. */
  d: string;
  oui: number;
  non: number;
}

/** `history.json` : par date de voyage, puis par sens, la serie d'observations. */
export type History = Record<string, Record<Dir, Observation[]>>;

export type DurationTier = 'direct' | 'intermediaire' | 'long';

export type EventKind = 'OPEN' | 'CLOSE' | 'REMOVED';

/** Un changement detecte entre deux snapshots consecutifs, pour un train. */
export interface TrainEvent {
  kind: EventKind;
  date: string;
  dir: Dir;
  trainNo: string;
  depart: string;
  arrivee: string;
  durationMin: number;
  tier: DurationTier;
}

/**
 * Ce qui merite de deranger, independamment de toute preference.
 *
 * `REOPENED` : une date qui n'avait plus une seule place en a de nouveau.
 * `DRAINING` : un creneau qui fond vite et dont il ne reste presque rien.
 *
 * Ces deux signaux portent sur le compte d'une (date, sens), pas sur un train :
 * c'est la maille a laquelle se prend la decision de partir ou non.
 */
export type SignalKind = 'REOPENED' | 'DRAINING';

export interface DateSignal {
  kind: SignalKind;
  date: string;
  dir: Dir;
  /** Places eligibles au snapshot precedent, puis au snapshot courant. */
  before: number;
  after: number;
}

export interface DiffResult {
  events: TrainEvent[];
  signals: DateSignal[];
}

/** Une entree explicite de surveillance. */
export interface WatchEntry {
  date: string;
  /** Absent = les deux sens. */
  dir?: Dir;
  /** `HH:MM`, bornes inclusives sur l'heure de depart. */
  after?: string;
  before?: string;
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Une regle recurrente, appliquee a toute date correspondante. */
export interface WatchRule {
  weekday: Weekday;
  dir?: Dir;
  after?: string;
  before?: string;
}

export interface Watchlist {
  watch: WatchEntry[];
  rules: WatchRule[];
}

/**
 * Un des 6 creneaux de reservation simultanee.
 *
 * Ces donnees ne quittent pas l'appareil : elles vivent dans le stockage local
 * de l'application, jamais dans le depot. Le collecteur n'en a plus l'usage
 * depuis que le rappel de confirmation est une alarme posee par le telephone.
 */
export interface Reservation {
  date: string;
  dir: Dir;
  trainNo: string;
  depart: string;
  arrivee: string;
  /** Date d'enregistrement, `YYYY-MM-DD`. */
  bookedAt: string;
  /** Passe a true par le geste « c'est confirme », qui annule le rappel. */
  confirmed: boolean;
}

export interface Reservations {
  slots: Reservation[];
}

/** Statistiques derivees de l'archive. Vides tant que l'echantillon est trop petit. */
export interface Stats {
  generatedAt: string;
  snapshotCount: number;
  /** false tant qu'on n'a pas assez de recul : la PWA n'affiche alors aucune prevision. */
  ready: boolean;
  /** Delai median entre l'entree d'une date a J+30 et le passage du train a NON. */
  burnRate: BurnRate[];
  /** Par numero de train : frequence de reouverture apres une fermeture. */
  reopen: Record<string, ReopenStat>;
  /** Courbe d'erosion moyenne J-30 -> J-0. */
  erosion: ErosionCurve[];
}

export interface BurnRate {
  /** 0 = dimanche, conforme a `Date.prototype.getDay`. */
  weekday: number;
  /** Tranche horaire de depart, `HH` arrondi a 2h : `06`, `08`, ... */
  slot: string;
  dir: Dir;
  medianDays: number;
  sample: number;
}

export interface ReopenStat {
  closed: number;
  reopened: number;
  rate: number;
  sample: number;
}

export interface ErosionCurve {
  weekday: number;
  dir: Dir;
  points: { daysBefore: number; avg: number; sample: number }[];
}

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Date d'enregistrement, pour reperer un abonnement qui a tourne. */
  updatedAt: string;
}
