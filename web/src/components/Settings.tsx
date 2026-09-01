import { useEffect, useState } from 'react';
import { MAX_RESERVATIONS } from '../../../src/config.ts';
import { getToken, setToken } from '../lib/github.ts';
import { enablePush, syncSubscription, type PushStatus } from '../lib/push.ts';
import { ageLabel, dirLabel, longDate, weekdayName } from '../lib/format.ts';
import type { Reservations, State, Stats, Watchlist } from '../../../src/types.ts';
import styles from './Panels.module.css';

interface Props {
  state: State;
  stats: Stats | null;
  watchlist: Watchlist;
  reservations: Reservations;
  onUnwatch: (index: number) => void;
  onRelease: (index: number) => void;
}

/**
 * Reglages, quota et watchlist.
 *
 * Vit dans la sheet comme tout le reste : il n'y a pas de navigation dans ce
 * produit, le calendrier est le seul ecran.
 */
export function Settings({ state, stats, watchlist, reservations, onUnwatch, onRelease }: Props) {
  const [token, setLocalToken] = useState(getToken() ?? '');
  const [saved, setSaved] = useState(getToken() !== null);
  const [push, setPush] = useState<PushStatus>('off');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void syncSubscription().then(setPush);
  }, []);

  const used = reservations.slots.length;

  return (
    <>
      <section className={styles.section}>
        <p className={styles.title}>Quota — {used} / {MAX_RESERVATIONS} reservations</p>

        <div className={styles.slots}>
          {Array.from({ length: MAX_RESERVATIONS }, (_, i) => (
            <span key={i} className={styles.slot} data-used={i < used} />
          ))}
        </div>

        {reservations.slots.length === 0 ? (
          <p className={styles.muted}>Aucun creneau occupe.</p>
        ) : (
          reservations.slots.map((slot, index) => (
            <div key={`${slot.date}-${slot.trainNo}`} className={styles.line}>
              <span>
                <span className={styles.mono}>{slot.depart}</span> {longDate(slot.date)}
                <br />
                <span className={styles.muted}>{dirLabel(slot.dir)} · n{slot.trainNo}</span>
              </span>
              <button type="button" className={styles.muted} onClick={() => onRelease(index)}>
                liberer
              </button>
            </div>
          ))
        )}
      </section>

      <section className={styles.section}>
        <p className={styles.title}>Surveillance</p>

        {watchlist.watch.length === 0 && watchlist.rules.length === 0 && (
          <p className={styles.muted}>Rien de surveille : aucune notification ne partira.</p>
        )}

        {watchlist.watch.map((entry, index) => (
          <div key={`${entry.date}-${entry.dir}`} className={styles.line}>
            <span>
              {longDate(entry.date)}
              <br />
              <span className={styles.muted}>
                {entry.dir ? dirLabel(entry.dir) : 'les deux sens'}
                {entry.after && ` · apres ${entry.after}`}
              </span>
            </span>
            <button type="button" className={styles.muted} onClick={() => onUnwatch(index)}>
              retirer
            </button>
          </div>
        ))}

        {watchlist.rules.map((rule, index) => (
          <div key={`rule-${index}`} className={styles.line}>
            <span>
              chaque {weekdayName(rule.weekday)}
              <br />
              <span className={styles.muted}>
                {rule.dir ? dirLabel(rule.dir) : 'les deux sens'}
                {rule.after && ` · apres ${rule.after}`}
              </span>
            </span>
            <span className={styles.muted}>regle</span>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <p className={styles.title}>Notifications</p>
        <p className={styles.muted}>
          {push === 'on' && 'Abonnement actif et synchronise avec le repo.'}
          {push === 'off' && "Pas encore d'abonnement sur cet appareil."}
          {push === 'unsynced' &&
            "Abonnement cree sur cet appareil, mais le collecteur ne le connait pas encore : enregistre le jeton ci-dessous, il sera publie dans la foulee."}
          {push === 'denied' && 'Permission refusee par le navigateur.'}
          {push === 'unsupported' && "Ce navigateur ne gere pas le Web Push."}
          {state.lastPushOk && ` Dernier envoi reussi ${ageLabel(state.lastPushOk)}.`}
        </p>

        {!saved && push !== 'on' && (
          <p className={styles.muted}>
            Enregistre d'abord le jeton GitHub : c'est lui qui publie l'abonnement dans le repo,
            sans quoi le collecteur n'a nulle part ou pousser.
          </p>
        )}

        {push !== 'on' && (
          <button
            type="button"
            className={styles.button}
            data-primary="true"
            onClick={() => {
              setError(null);
              void enablePush().then(setPush).catch((cause: Error) => setError(cause.message));
            }}
          >
            Activer les notifications
          </button>
        )}
      </section>

      <section className={styles.section}>
        <p className={styles.title}>Jeton GitHub</p>
        <p className={styles.muted}>
          Un PAT fine-grained avec <code>Contents: write</code> sur ce seul repo. Il reste dans le
          stockage local de ce telephone et n'est envoye qu'a l'API GitHub. A revoquer en cas de
          perte de l'appareil.
        </p>
        <input
          className={styles.field}
          type="password"
          value={token}
          placeholder="github_pat_..."
          autoComplete="off"
          onChange={(event) => setLocalToken(event.target.value)}
          style={{ marginTop: 9 }}
        />
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            const trimmed = token.trim();
            setToken(trimmed || null);
            setSaved(trimmed.length > 0);
            setError(null);
            void syncSubscription().then(setPush);
          }}
        >
          Enregistrer
        </button>
        {error && <p className={styles.muted}>{error}</p>}
      </section>

      <section className={styles.section}>
        <p className={styles.title}>Archive</p>
        <p className={styles.muted}>
          {state.snapshotCount} snapshots collectes, {state.recordCount} lignes au dernier.
          {stats?.ready
            ? ' Previsions actives.'
            : " Previsions inactives : pas encore assez de recul, les donnees brutes sont affichees telles quelles."}
        </p>
      </section>

      <section className={styles.section}>
        <p className={styles.muted}>
          Donnees TGVmax, SNCF Voyageurs, licence ODbL.
        </p>
      </section>
    </>
  );
}
