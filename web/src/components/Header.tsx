import { DIRECTIONS, STALE_DATA_HOURS } from '../../../src/config.ts';
import { ageLabel, dirLabel, hoursSince } from '../lib/format.ts';
import type { State } from '../../../src/types.ts';
import styles from './Header.module.css';

interface Props {
  dir: string;
  /** Progression du glissement en cours, `null` au repos. Suivi 1:1 du doigt. */
  dragProgress: number | null;
  state: State;
  onDirChange: (dir: string) => void;
  onSettings: () => void;
}

export function Header({ dir, dragProgress, state, onDirChange, onSettings }: Props) {
  const index = Math.max(0, DIRECTIONS.indexOf(dir as (typeof DIRECTIONS)[number]));
  const position = dragProgress ?? index;

  const processed = state.dataProcessed;
  const stale = processed !== null && hoursSince(processed) > STALE_DATA_HOURS;

  return (
    <header className={styles.header}>
      <div className={styles.switch}>
        <div
          className={styles.thumb}
          style={{
            transform: `translate3d(${position * 100}%, 0, 0)`,
            transition: dragProgress === null ? 'transform var(--normal) var(--ease)' : 'none',
          }}
        />
        {DIRECTIONS.map((option, i) => (
          <button
            key={option}
            type="button"
            className={styles.option}
            data-active={Math.round(position) === i}
            onClick={() => onDirChange(option)}
          >
            {dirLabel(option)}
          </button>
        ))}
      </div>

      <div className={styles.status}>
        {/* La date de publication est affichee en clair : la donnee peut avoir
            plus de 24 h, et c'est la seule information d'etat du produit. */}
        <span>
          {processed ? `donnee du ${new Date(processed).toLocaleDateString('fr-FR')}` : 'aucune donnee'}
          {processed && ` · ${ageLabel(processed)}`}
        </span>
        <button type="button" className={styles.settings} onClick={onSettings}>
          reglages
        </button>
      </div>

      {stale && (
        <p className={styles.stale}>
          Donnee vieille de plus de {STALE_DATA_HOURS} h : le collecteur ne tourne plus.
        </p>
      )}
    </header>
  );
}
