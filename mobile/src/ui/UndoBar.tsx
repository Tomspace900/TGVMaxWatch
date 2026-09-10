import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, typo, useTheme } from '../theme.ts';

/**
 * Ce qui vient d'etre retire, et de quoi le remettre.
 *
 * Le libelle est ecrit par l'appelant parce que lui seul connait l'objet — et
 * il doit nommer **ce qui a disparu**, pas l'action : « suivi retiré » ne dit
 * pas lequel, et c'est precisement l'information qui manquait.
 */
export interface UndoAction {
  label: string;
  undo: () => void;
}

/** Duree d'exposition. Assez pour lire une ligne et decider, pas plus. */
const LIFETIME_MS = 6000;

/**
 * Un seul defaire, partage par tous les gestes destructifs d'un ecran.
 *
 * Quatre gestes retirent quelque chose sur l'accueil — un suivi de date, une
 * regle recurrente, une reservation depuis le suivi, une reservation depuis sa
 * propre liste. Quatre barres deviendraient quatre comportements des que l'une
 * derive, exactement ce que `SwipeRow` a deja regle pour le balayage lui-meme.
 *
 * Un defaire plutot qu'une confirmation, et ce n'est pas un gout : confirmer
 * chaque balayage le transformerait en formulaire, ce que ce projet s'interdit
 * la ou le geste *est* l'interface. Le geste reste immediat, il devient
 * seulement reversible.
 */
export function useUndo() {
  const [action, setAction] = useState<UndoAction | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clear();
    setAction(null);
  }, [clear]);

  /*
   * Une offre remplace la precedente au lieu de s'empiler : deux balayages
   * rapproches laisseraient sinon un defaire perime a l'ecran, qui remettrait
   * la mauvaise ligne.
   */
  const offer = useCallback(
    (next: UndoAction) => {
      clear();
      setAction(next);
      timer.current = setTimeout(() => setAction(null), LIFETIME_MS);
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  return { action, offer, dismiss };
}

/**
 * La barre elle-meme.
 *
 * Neutre, jamais l'accent : le Carmillon designe ce qui t'engage — une
 * reservation, une echeance, une panne — et retirer une ligne qu'on peut
 * remettre n'en est pas. Une confirmation reste neutre.
 */
export function UndoBar({ action, onDismiss }: { action: UndoAction | null; onDismiss: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!action) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      pointerEvents="box-none"
      style={[styles.dock, { bottom: insets.bottom + space.md }]}
    >
      <View
        style={[
          styles.bar,
          { backgroundColor: theme.surface, borderColor: theme.line, borderRadius: radius.md },
        ]}
      >
        <Text style={[typo.body, styles.label, { color: theme.text }]} numberOfLines={2}>
          {action.label}
        </Text>
        <Pressable
          onPress={() => {
            action.undo();
            onDismiss();
          }}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={[typo.section, { color: theme.text }]}>annuler</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: space.lg, right: space.lg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    // La barre flotte au-dessus du contenu : sans ombre elle se confond avec la
    // carte qu'elle recouvre.
    elevation: 6,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  label: { flex: 1, lineHeight: 18 },
});
