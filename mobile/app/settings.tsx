import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useStore } from '../src/data/store.ts';
import {
  getToken,
  setToken,
  verifyToken,
  writeFile,
  type TokenCheck,
} from '../src/data/github.ts';
import { exportToFile, importFromFile } from '../src/data/backup.ts';
import { syncConfirmReminders } from '../src/data/reminders.ts';
import { currentPushState, requestPushToken, type PushState } from '../src/data/push.ts';
import { maskToken } from '../src/format.ts';
import { Action, Actions, Note, Row, Section, Status } from '../src/ui/Settings.tsx';
import { radius, space, typo, useTheme } from '../src/theme.ts';

/*
 * Des reglages, et rien d'autre.
 *
 * Cet ecran a d'abord perdu la gestion — reservations et suivis sont partis sur
 * l'accueil, ou l'on est quand ils comptent. Il lui restait le defaut inverse :
 * du texte partout. Un paragraphe sous chaque bouton, l'etat interne de la
 * synchronisation en lignes cle/valeur, la maturite des statistiques, le
 * fonctionnement des mises a jour explique en trois phrases. De la
 * documentation, sur l'ecran le moins ouvert de l'application.
 *
 * Trois coupes, et une regle pour chacune :
 *
 * - **ce qui est deja affiche ailleurs** ne se repete pas ici. Le nombre de
 *   snapshots est sur l'accueil, la fraicheur de la donnee aussi, la maturite
 *   des statistiques est sur l'ecran qui les montre. Les revoir ici n'apprenait
 *   rien et il fallait les lire pour s'en apercevoir ;
 * - **ce qui ne se regle pas** n'est pas un reglage. « Dernier envoi »,
 *   « code execute », « lignes au dernier snapshot » sont des mesures : elles
 *   ne demandent aucune decision, elles occupaient la place de celles qui en
 *   demandent une ;
 * - **une explication n'a de valeur qu'attachee a une decision**. La phrase qui
 *   dit pourquoi un bouton est grise reste ; celle qui raconte comment
 *   fonctionnent les mises a jour est partie avec le bouton qu'elle
 *   accompagnait, maintenant que la mise a jour se propose d'elle-meme.
 *
 * Ce qui reste : ce qui a un interrupteur, et la mention ODbL, qui doit rester
 * visible.
 */

/** Chaque refus de GitHub demande un geste different : il faut donc les nommer. */
const TOKEN_ERRORS: Record<Exclude<TokenCheck, { ok: true }>['reason'], string> = {
  invalid: 'Jeton refusé : expiré, révoqué, ou incomplet à la copie.',
  'no-access': 'Ce jeton ne donne pas accès à ce dépôt.',
  'read-only': 'Ce jeton est en lecture seule. Il lui faut Contents: write.',
  network: 'GitHub est injoignable.',
};

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bundle, setWatchlist, setReservations } = useStore();

  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const [editingToken, setEditingToken] = useState(false);
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    void getToken().then(setStoredToken);
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
    setEditingToken(false);
    setDraft('');
    setTokenError(null);
  };

  const forgetToken = async () => {
    await setToken(null);
    setStoredToken(null);
    setEditingToken(false);
    setDraft('');
    setTokenError(null);
  };

  // ------------------------------------------------------------ sauvegarde

  /*
   * Annuler n'est pas echouer.
   *
   * Ressortir du selecteur de fichiers est un geste ordinaire, pas une panne :
   * il ne laisse aucun message. Le reste — un dossier ou l'on ne peut pas
   * ecrire, un fichier qui n'est pas une sauvegarde — se dit, comme tout ce qui
   * echoue ici.
   */
  const exportState = async () => {
    setBusy(true);
    const result = await exportToFile(bundle.reservations, bundle.watchlist);
    setBusy(false);
    if (result.kind === 'cancelled') return;
    setMessage(result.kind === 'ok' ? `Sauvegardé dans ${result.label}.` : result.message);
  };

  const importState = async () => {
    setBusy(true);
    const result = await importFromFile();
    setBusy(false);
    if (result.kind === 'cancelled') return;
    if (result.kind === 'error' || !result.data) {
      setMessage(result.kind === 'error' ? result.message : 'Sauvegarde illisible.');
      return;
    }

    const { reservations, watchlist } = result.data;
    setReservations(() => reservations);
    setWatchlist(() => watchlist, 'watchlist: restauration');
    void syncConfirmReminders(reservations.slots);
    setMessage(`${reservations.slots.length} créneaux restaurés.`);
  };

  // ----------------------------------------------------------- mises a jour

  const updates = Updates.useUpdates();

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
        {push.status === 'ready' && <Status text="Actives sur cet appareil." />}

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
          </>
        )}

        {push.status === 'off' && (
          <Action
            label="Activer les notifications"
            onPress={() => void enablePush()}
            primary
            disabled={!token}
          />
        )}

        {push.status === 'denied' && (
          <>
            <Status attention text="Permission refusée par Android." />
            <Action label="Ouvrir les réglages système" onPress={() => void Linking.openSettings()} />
          </>
        )}

        {push.status === 'unknown' && <Note>Hors ligne : état invérifiable.</Note>}
        {push.status === 'unsupported' && <Note>Indisponible sans appareil réel.</Note>}

        {/* La seule explication qui reste : celle qui dit pourquoi le bouton
            juste au-dessus ne repond pas. */}
        {!token && (push.status === 'off' || push.status === 'stale') && (
          <Note>Il faut d’abord un jeton GitHub, plus bas.</Note>
        )}
      </Section>

      <Section title="Sauvegarde">
        <Note>
          Tes réservations ne vivent que sur cet appareil. Sans export récent, un téléphone perdu
          emporte la liste.
        </Note>

        {/* Deux gestes symetriques, deux boutons de meme poids : ecrire un
            fichier, en relire un. Le champ de collage demandait de traiter sa
            propre sauvegarde comme un message. */}
        <Actions>
          <View style={{ flex: 1 }}>
            <Action label="Exporter" disabled={busy} onPress={() => void exportState()} />
          </View>
          <View style={{ flex: 1 }}>
            <Action label="Restaurer" disabled={busy} onPress={() => void importState()} />
          </View>
        </Actions>
      </Section>

      <Section title="Jeton GitHub">
        {!editingToken && token && (
          <>
            <Row label="jeton" value={maskToken(token)} mono />
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
              Un PAT fine-grained avec Contents: write sur ce dépôt. C’est lui qui publie tes suivis
              — sans lui, aucune alerte ne part.
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
      </Section>

      <Section title="Application">
        <Row label="version" value={Constants.expoConfig?.version ?? '—'} />

        {/* La mise a jour se propose d'elle-meme des qu'elle est prete. Ce
            bouton n'est plus que le chemin de ceux qui n'attendent pas. */}
        {updates.isUpdatePending ? (
          <Action label="Redémarrer pour mettre à jour" primary onPress={() => void Updates.reloadAsync()} />
        ) : (
          <Action
            label={
              updates.isDownloading
                ? 'Téléchargement…'
                : updates.isChecking
                  ? 'Vérification…'
                  : 'Chercher une mise à jour'
            }
            disabled={updates.isChecking || updates.isDownloading}
            onPress={() => void Updates.checkForUpdateAsync()}
          />
        )}

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
