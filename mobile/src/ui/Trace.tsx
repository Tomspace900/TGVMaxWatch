import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme.ts';

/** Largeur et espacement d'un jour. Assez fin pour qu'un mois tienne sur une ligne. */
const CELL = 3;
const GAP = 1;

interface Props {
  /** Suite de `O`, `N` et `-`, un caractere par date de collecte. */
  trace: string;
}

/**
 * Disponibilite d'un train, jour apres jour.
 *
 * Repond a la question qu'on se pose devant un train encore libre : est-ce
 * qu'il tient, ou est-ce qu'il vient de rouvrir apres avoir ete complet ? La
 * source ne le dira jamais — elle ecrase son dataset chaque jour — et c'est
 * exactement ce que l'archive de ce projet permet.
 *
 * Le plus ancien a gauche, aujourd'hui a droite : on lit dans le sens du temps.
 */
export function Trace({ trace }: Props) {
  const theme = useTheme();
  if (trace.length < 2) return null;

  return (
    <View style={styles.row}>
      {trace.split('').map((mark, index) => (
        <View
          key={index}
          style={[
            styles.cell,
            {
              // La couleur saturee reste l'echelle de disponibilite, et rien
              // d'autre. Un jour sans donnee s'efface au lieu de se colorer.
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
  row: { flexDirection: 'row', gap: GAP, alignItems: 'center' },
  cell: { width: CELL, height: 10, borderRadius: 1 },
});
