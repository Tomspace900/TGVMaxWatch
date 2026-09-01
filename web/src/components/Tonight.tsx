import { addDays } from '../../../src/dates.ts';
import type { Calendar } from '../lib/model.ts';
import styles from './Tonight.module.css';

interface Props {
  calendar: Calendar;
  today: string;
  dir: string;
  onSelect: (date: string) => void;
}

/**
 * Ce soir et demain.
 *
 * Le snapshot du matin contient precisement les places liberees la veille a 17h
 * par les non-confirmations. C'est la seule facon legitime de capter le dernier
 * moment avec cette source — et il n'y en aura pas d'autre : une verification a
 * 17h02 relirait exactement le meme fichier que celle du matin.
 */
export function Tonight({ calendar, today, dir, onSelect }: Props) {
  const entries = [
    { label: 'ce soir', date: today },
    { label: 'demain', date: addDays(today, 1) },
  ].map((entry) => ({ ...entry, day: calendar.get(entry.date)?.get(dir) }));

  const total = entries.reduce((sum, entry) => sum + (entry.day?.available ?? 0), 0);
  if (total === 0) return null;

  return (
    <div className={styles.strip}>
      {entries.map(({ label, date, day }) =>
        !day || day.available === 0 ? null : (
          <button key={date} className={styles.entry} onClick={() => onSelect(date)}>
            <span className={styles.count}>{day.available}</span>
            <span className={styles.label}>{label}</span>
            {day.onlyLong && <span className={styles.long}>longs</span>}
          </button>
        ),
      )}
    </div>
  );
}
