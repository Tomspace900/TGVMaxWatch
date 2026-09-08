import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { radius, space, typo, useTheme } from '../theme.ts';

/**
 * La mise a jour vient a toi, tu ne vas plus la chercher.
 *
 * Le comportement par defaut d'`expo-updates` demande deux lancements : le
 * premier telecharge en fond, le second execute. Entre les deux, l'application
 * tourne sur du code dont elle sait deja qu'il est perime, et rien ne le dit —
 * d'ou le reflexe d'aller voir dans les reglages, c'est-a-dire d'aller chercher
 * a la main une information que l'application detient.
 *
 * Le second lancement n'est pourtant qu'une convention : une fois le paquet
 * telecharge, `reloadAsync` l'applique tout de suite. Il ne manquait qu'un
 * endroit pour le proposer, et le bon endroit est celui ou l'on est deja.
 *
 * Ce n'est pas un ecran de reglage : ca n'a rien a regler. Une seule decision,
 * disponible seulement quand elle est reellement possible — le paquet est la,
 * il ne reste qu'a redemarrer.
 */
export function UpdateGate() {
  const theme = useTheme();
  const { isUpdateAvailable, isUpdatePending, isDownloading, isRestarting } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);

  /*
   * Telecharger sans attendre le hasard du lancement.
   *
   * `checkAutomatically` le fait deja au demarrage, mais son moment ne nous
   * appartient pas : si une mise a jour est annoncee et qu'aucun paquet n'est
   * pret, on la reclame. L'echec ne se dit pas — une mise a jour qui n'arrive
   * pas laisse simplement l'application dans l'etat ou elle etait.
   */
  useEffect(() => {
    if (!Updates.isEnabled) return;
    if (!isUpdateAvailable || isUpdatePending || isDownloading) return;
    void Updates.fetchUpdateAsync().catch(() => {});
  }, [isUpdateAvailable, isUpdatePending, isDownloading]);

  // « Plus tard » ne vaut que pour cette session : au prochain lancement la
  // question se repose, parce qu'elle aura de nouveau une reponse utile.
  const open = Updates.isEnabled && isUpdatePending && !dismissed;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setDismissed(true)}>
      <View style={styles.scrim}>
        <View style={[styles.card, { backgroundColor: theme.raised, borderRadius: radius.lg }]}>
          <Text style={[typo.section, styles.title, { color: theme.text }]}>
            Mise à jour prête
          </Text>
          <Text style={[typo.small, styles.body, { color: theme.muted }]}>
            Elle est déjà téléchargée. Le redémarrage prend une seconde et ne perd rien.
          </Text>

          <Pressable
            onPress={() => void Updates.reloadAsync()}
            disabled={isRestarting}
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: theme.accent,
                borderRadius: radius.sm,
                opacity: isRestarting ? 0.6 : pressed ? 0.8 : 1,
              },
            ]}
          >
            {isRestarting ? (
              <ActivityIndicator color={theme.onBrand} />
            ) : (
              <Text style={[typo.section, styles.primaryText, { color: theme.onBrand }]}>
                Redémarrer maintenant
              </Text>
            )}
          </Pressable>

          <Pressable onPress={() => setDismissed(true)} hitSlop={8} style={styles.later}>
            <Text style={[typo.body, { color: theme.muted }]}>plus tard</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  card: { padding: space.lg, gap: space.md },
  title: { fontSize: 17 },
  body: { lineHeight: 18 },
  primary: { paddingVertical: 13, alignItems: 'center', marginTop: space.xs },
  primaryText: { fontSize: 14 },
  later: { alignSelf: 'center', paddingVertical: space.xs },
});
