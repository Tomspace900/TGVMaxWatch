import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useStore } from '../src/data/store.ts';
import {
  getToken,
  getTokenVerifiedAt,
  setToken,
  verifyToken,
  writeFile,
  type TokenCheck,
} from '../src/data/github.ts';
import { exportLocalState, parseExport } from '../src/data/local.ts';
import { syncConfirmReminders } from '../src/data/reminders.ts';
import { currentPushState, requestPushToken, type PushState } from '../src/data/push.ts';
import { instantLabel, maskToken } from '../src/format.ts';
import { Action, Actions, Note, Row, Section, Status } from '../src/ui/Settings.tsx';
import { radius, space, typo, useTheme } from '../src/theme.ts';

/*
 * Des reglages, et plus de la gestion.
 *
 * Cet ecran portait la liste des reservations et celle des suivis, avec
 * leurs boutons — c'est-a-dire l'ecran le moins frequente de l'application
 * charge de gestes qui comptent au moment ou l'on est ailleurs. Les deux vivent
 * desormais sur l'accueil, avec le meme balayage que partout ailleurs. Ne reste
 * ici que ce qui se regle une fois : notifications, jeton, sauvegarde, mises a
 * jour, etat de l'archive.
 */

/** Chaque refus de GitHub demande un geste different : il faut donc les nommer. */
const TOKEN_ERRORS: Record<Exclude<TokenCheck, { ok: true }>['reason'], string> = {
  invalid: 'Jeton refusé par GitHub : expiré, révoqué, ou incomplet à la copie.',
  'no-access': 'Ce jeton ne donne pas accès à ce dépôt. Vérifie le dépôt choisi à sa création.',
  'read-only': 'Ce jeton est en lecture seule. Il lui faut la permission Contents: write.',
  network: 'GitHub est injoignable pour le moment.',
};

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bundle, setWatchlist, setReservations } = useStore();

  const [message, setMessage] = useState<string | null>(null);
  const [restore, setRestore] = useState('');

  const persist = useCallback(async (path: string, value: unknown, note: string) => {
    try {
      await writeFile(path, value, note);
      setMessage(null);
      return true;
    } catch (error) {
      setMessage((error as Error).message);
      return false;
    }
  }, []);

  // -------------------------------------------------------- notifications

  const published = bundle.pushToken?.expoPushToken ?? null;
  const [push, setPush] = useState<PushState>({ status: 'off', token: null });

  /*
   * L'etat se lit au montage, sans jamais ouvrir de fenetre de permission.
   *
   * C'est le defaut que cet ecran avait : l'etat partait de « off » a chaque
   * ouverture, et le bouton « activer les notifications » se reproposait
   * indefiniment alors qu'elles etaient deja actives.
   */
  useEffect(() => {
    void currentPushState(published).then(setPush);
  }, [published]);

  const enablePush = async () => {
    const next = await requestPushToken(published);
    setPush(next);
    if (!next.token || next.token === published) return;

    const ok = await persist(
      'data/push-token.json',
      { expoPushToken: next.token, updatedAt: new Date().toISOString() },
      'push: jeton Expo',
    );
    if (ok) setPush({ ...next, status: 'ready' });
  };

  // ------------------------------------------------------------ jeton PAT

  const [token, setStoredToken] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [editingToken, setEditingToken] = useState(false);
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    void getToken().then(setStoredToken);
    void getTokenVerifiedAt().then(setVerifiedAt);
  }, []);

  /**
   * Un jeton ne s'enregistre qu'apres avoir prouve qu'il fonctionne.
   *
   * Un PAT tronque a la copie se comportait exactement comme un jeton absent :
   * l'ecriture echouait en silence, et l'edition faite depuis le telephone
   * disparaissait au rafraichissement suivant sans que rien ne l'explique.
   */
  const saveToken = async () => {
    const value = draft.trim();
    if (!value) return;

    setChecking(true);
    const check = await verifyToken(value);
    setChecking(false);

    if (!check.ok) {
      setTokenError(TOKEN_ERRORS[check.reason]);
      return;
    }

    await setToken(value);
    setStoredToken(value);
    setVerifiedAt(new Date().toISOString());
    setEditingToken(false);
    setDraft('');
    setTokenError(null);
  };

  const forgetToken = async () => {
    await setToken(null);
    setStoredToken(null);
    setVerifiedAt(null);
    setEditingToken(false);
    setDraft('');
    setTokenError(null);
  };

  // ------------------------------------------------------------ sauvegarde

  const exportState = () => {
    void Share.share({ message: exportLocalState(bundle.reservations, bundle.watchlist) });
  };

  const importState = () => {
    const parsed = parseExport(restore.trim());
    if (!parsed) {
      setMessage('Sauvegarde illisible : rien n’a été modifié.');
      return;
    }
    setReservations(() => parsed.reservations);
    setWatchlist(() => parsed.watchlist, 'watchlist: restauration');
    void syncConfirmReminders(parsed.reservations.slots);
    setRestore('');
    setMessage(`${parsed.reservations.slots.length} créneaux restaurés.`);
  };

  // ----------------------------------------------------------- mises a jour

  const updates = Updates.useUpdates();
  const running = updates.currentlyRunning;

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>Réglages</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.close, { color: theme.muted }]}>fermer</Text>
        </Pressable>
      </View>

      {message && (
        <View style={[styles.message, { backgroundColor: theme.sunken, borderRadius: radius.sm }]}>
          <Text style={[styles.messageText, { color: theme.text }]}>{message}</Text>
        </View>
      )}

      <Section title="Notifications">
        {push.status === 'ready' && (
          <>
            <Status text="Actives sur cet appareil." />
            {bundle.pushToken && (
              <Row label="jeton enregistré" value={instantLabel(bundle.pushToken.updatedAt)} />
            )}
            {bundle.state.lastPushOk && (
              <Row label="dernier envoi" value={instantLabel(bundle.state.lastPushOk)} />
            )}
          </>
        )}

        {push.status === 'stale' && (
          <>
            <Status
              attention
              text={
                bundle.pushToken
                  ? 'Le dépôt porte le jeton d’une autre installation : le collecteur pousse dans le vide.'
                  : 'Cet appareil n’est pas encore enregistré dans le dépôt.'
              }
            />
            <Action
              label={bundle.pushToken ? 'Réenregistrer cet appareil' : 'Enregistrer cet appareil'}
              onPress={() => void enablePush()}
              primary
              disabled={!token}
            />
            {!token && <Note>Il faut d’abord un jeton GitHub : c’est lui qui écrit dans le dépôt.</Note>}
          </>
        )}

        {push.status === 'off' && (
          <>
            <Note>
              Une date qui rouvre, un créneau qui se vide, tes créneaux suivis. Au plus un message
              par collecte.
            </Note>
            <Action
              label="Activer les notifications"
              onPress={() => void enablePush()}
              primary
              disabled={!token}
            />
            {!token && <Note>Il faut d’abord un jeton GitHub : c’est lui qui écrit dans le dépôt.</Note>}
          </>
        )}

        {push.status === 'denied' && (
          <>
            <Status attention text="Permission refusée. Elle se réautorise dans les réglages Android." />
            <Action label="Ouvrir les réglages système" onPress={() => void Linking.openSettings()} />
          </>
        )}

        {push.status === 'unknown' && (
          <Note>
            Hors ligne : impossible de vérifier que le dépôt porte bien le jeton de cet appareil.
          </Note>
        )}

        {push.status === 'unsupported' && (
          <Note>Indisponible ici : il faut un appareil réel et un build EAS.</Note>
        )}
      </Section>

      <Section title="Application">
        <Row label="version" value={Constants.expoConfig?.version ?? '—'} />
        {running.runtimeVersion && <Row label="runtime" value={running.runtimeVersion} />}
        <Row
          label="code exécuté"
          value={
            running.isEmbeddedLaunch
              ? 'embarqué dans l’APK'
              : running.createdAt
                ? instantLabel(running.createdAt)
                : '—'
          }
        />
        {updates.lastCheckForUpdateTimeSinceRestart && (
          <Row
            label="dernière vérification"
            value={instantLabel(updates.lastCheckForUpdateTimeSinceRestart)}
          />
        )}

        {updates.isUpdatePending ? (
          <>
            <Status text="Mise à jour téléchargée." />
            <Action
              label="Redémarrer pour l’appliquer"
              primary
              onPress={() => void Updates.reloadAsync()}
            />
          </>
        ) : updates.isUpdateAvailable ? (
          <>
            <Status text="Une mise à jour est disponible." />
            <Action
              label={updates.isDownloading ? 'Téléchargement…' : 'Télécharger'}
              primary
              disabled={updates.isDownloading}
              onPress={() => void Updates.fetchUpdateAsync()}
            />
          </>
        ) : (
          <Action
            label={updates.isChecking ? 'Vérification…' : 'Chercher une mise à jour'}
            disabled={updates.isChecking}
            onPress={() => void Updates.checkForUpdateAsync()}
          />
        )}

        {updates.checkError && <Note>Vérification impossible : {updates.checkError.message}</Note>}

        <Note>
          L’application cherche déjà une mise à jour à chaque lancement et la télécharge en fond ;
          elle s’applique au redémarrage suivant. Ce bouton ne sert qu’à ne pas attendre.
        </Note>
      </Section>

      <Section title="Sauvegarde">
        <Note>
          Tes réservations vivent sur cet appareil et nulle part ailleurs. L’export les copie, avec
          ton suivi, dans un texte que tu partages où tu veux. Sans export récent, un
          téléphone perdu emporte la liste — les réservations elles-mêmes restent chez SNCF.
        </Note>

        <Action label="Exporter" onPress={exportState} />

        <TextInput
          value={restore}
          onChangeText={setRestore}
          placeholder="Coller une sauvegarde pour la restaurer"
          placeholderTextColor={theme.muted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.field,
            {
              backgroundColor: theme.sunken,
              color: theme.text,
              borderRadius: radius.sm,
              minHeight: 72,
            },
          ]}
        />

        {restore.trim().length > 0 && <Action label="Restaurer" onPress={importState} />}
      </Section>

      <Section title="Jeton GitHub">
        {!editingToken && token && (
          <>
            <Row label="jeton" value={maskToken(token)} mono />
            {verifiedAt && <Row label="vérifié le" value={instantLabel(verifiedAt)} />}
            <Actions>
              <View style={{ flex: 1 }}>
                <Action
                  label="Modifier"
                  onPress={() => {
                    setDraft('');
                    setTokenError(null);
                    setEditingToken(true);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Action label="Retirer" onPress={() => void forgetToken()} />
              </View>
            </Actions>
          </>
        )}

        {!editingToken && !token && (
          <>
            <Note>
              Un PAT fine-grained avec Contents: write sur ce seul dépôt. Il sert à écrire ta
              suivi depuis le téléphone — la lecture, elle, n’en a pas besoin.
            </Note>
            <Action
              label="Enregistrer un jeton"
              primary
              onPress={() => {
                setDraft('');
                setTokenError(null);
                setEditingToken(true);
              }}
            />
          </>
        )}

        {editingToken && (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="github_pat_…"
              placeholderTextColor={theme.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              style={[
                styles.field,
                { backgroundColor: theme.sunken, color: theme.text, borderRadius: radius.sm },
              ]}
            />

            {tokenError && <Status attention text={tokenError} />}

            <Actions>
              <View style={{ flex: 1 }}>
                <Action
                  label={checking ? 'Vérification…' : 'Vérifier et enregistrer'}
                  primary
                  disabled={checking || draft.trim().length === 0}
                  onPress={() => void saveToken()}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Action
                  label="Annuler"
                  onPress={() => {
                    setEditingToken(false);
                    setDraft('');
                    setTokenError(null);
                  }}
                />
              </View>
            </Actions>
          </>
        )}

        <Note>Rangé dans le keystore Android. À révoquer sur GitHub en cas de perte de l’appareil.</Note>
      </Section>

      <Section title="Archive">
        <Row label="snapshots" value={String(bundle.state.snapshotCount)} />
        <Row label="lignes au dernier" value={String(bundle.state.recordCount)} />
        {bundle.state.collectedAt && (
          <Row label="dernière collecte" value={instantLabel(bundle.state.collectedAt)} />
        )}
        {/* Chaque statistique est publiee des qu'elle a un echantillon, pas
            toutes ensemble : elles ne murissent pas au meme rythme. */}
        <Row
          label="taux de réouverture"
          value={
            bundle.stats?.ready.reopen
              ? `${Object.keys(bundle.stats.reopen).length} trains`
              : 'en attente'
          }
        />
        <Row label="courbe d’érosion" value={bundle.stats?.ready.erosion ? 'publiée' : 'en attente'} />
        <Row label="délais de fonte" value={bundle.stats?.ready.burnRate ? 'publiés' : 'en attente'} />
        <Note>Données TGVmax, SNCF Voyageurs, licence ODbL.</Note>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...typo.hero },
  close: { ...typo.body, fontSize: 14 },
  message: { padding: space.md, marginTop: space.md },
  messageText: { ...typo.small, lineHeight: 18 },
  field: { ...typo.digits, padding: 13, fontSize: 13 },
});
