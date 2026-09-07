import { StyleSheet, View } from 'react-native';
import { space, useTheme } from '../theme.ts';

/** Largeur et espacement d'un jour. Assez fin pour tenir a cote d'une duree. */
const CELL = 3;
const GAP = 1.5;

/** Nombre de collectes montrees. Au-dela, la frise redevient un mur de pixels. */
const RECENT_DAYS = 7;

interface Props {
  /** Suite de `O`, `N` et `-`, un caractere par date de collecte. */
  trace: string;
  days?: number;
}

/**
 * Disponibilite d'un train, les derniers jours.
 *
 * Elle avait disparu au profit du seul verdict — « vient de rouvrir »,
 * « instable » — parce que trente cellules par ligne sur trente-cinq lignes
 * demandaient une legende permanente et pres de mille vues. Le verdict reste ce
 * qui decide, mais il ne sort que sur deux cas, et le reste du temps la ligne ne
 * disait plus rien de son passe.
 *
 * Sept jours suffisent a repondre a « est-ce que ca tient ? » et coutent sept
 * fois moins. Le plus ancien a gauche, aujourd'hui a droite : on lit dans le
 * sens du temps.
 */
export function Trace({ trace, days = RECENT_DAYS }: Props) {
  const theme = useTheme();
  const recent = trace.slice(-days);
  if (recent.length < 2) return null;

  return (
    <View style={styles.row}>
      {recent.split('').map((mark, index) => (
        <View
          key={index}
          style={[
            styles.cell,
            {
              // La couleur saturee reste l'echelle de disponibilite, et rien
              // d'autre — ici sur son cas le plus simple, ouvert ou non. Un jour
              // sans donnee s'efface au lieu de se colorer.
              backgroundColor:
                mark === 'O' ? theme.avail[3] : mark === 'N' ? theme.line : 'transparent',
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP, alignItems: 'center', marginTop: space.xs },
  cell: { width: CELL, height: 9, borderRadius: 1 },
});
