import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { MAX_RESERVATIONS } from '../../src/config.ts';
import { todayInParis } from '../../src/dates.ts';
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
import { cancelConfirmReminder, syncConfirmReminders } from '../src/data/reminders.ts';
import { currentPushState, requestPushToken, type PushState } from '../src/data/push.ts';
import { dirLabel, instantLabel, longDate, maskToken, weekdayName } from '../src/format.ts';
import { Action, Actions, Note, Row, Section, Status } from '../src/ui/Settings.tsx';
import { radius, space, useTheme } from '../src/theme.ts';
import type { Watchlist } from '../../src/types.ts';

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
  const { bundle, storageOk, setWatchlist, setReservations } = useStore();

  const [message, setMessage] = useState<string | null>(null);
  const [restore, setRestore] = useState('');

  const today = todayInParis();

  /*
   * Le quota TGVmax porte sur les reservations *simultanees* : un creneau se
   * libere quand le train est passe. Les voyages deja faits restent affiches —
   * c'est un historique qu'on ne jette pas — mais ils ne comptent plus.
   */
  const upcoming = bundle.reservations.slots.filter((slot) => slot.date >= today);
  const used = upcoming.length;

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

  // ---------------------------------------------------------------- quota

  /** Le creneau disparait, et le rappel qui l'accompagnait avec lui. */
  const release = (index: number) => {
    const removed = bundle.reservations.slots[index];
    setReservations((current) => ({ slots: current.slots.filter((_, i) => i !== index) }));
    if (removed) void cancelConfirmReminder(removed);
  };

  /**
   * « C'est confirmé ».
   *
   * Le champ `confirmed` etait ecrit `false` a la creation et jamais relu : il
   * porte desormais un vrai geste, dont le seul effet visible est de faire
   * taire un rappel devenu inutile.
   */
  const confirm = (index: number) => {
    const slot = bundle.reservations.slots[index];
    if (!slot) return;
    setReservations((current) => ({
      slots: current.slots.map((entry, i) => (i === index ? { ...entry, confirmed: true } : entry)),
    }));
    void cancelConfirmReminder(slot);
  };

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

  // ------------------------------------------------------------- watchlist

  const unwatch = (index: number) => {
    const next: Watchlist = {
      ...bundle.watchlist,
      watch: bundle.watchlist.watch.filter((_, i) => i !== index),
    };
    setWatchlist(next);
    void persist('watchlist.json', next, 'watchlist: retrait');
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
    setWatchlist(parsed.watchlist);
    void syncConfirmReminders(parsed.reservations.slots);
    void persist('watchlist.json', parsed.watchlist, 'watchlist: restauration');
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

      <Section title={`Quota — ${used} / ${MAX_RESERVATIONS}`}>
        {/* Une panne du stockage local est la seule perte irreversible que
            cette application puisse causer : elle ne peut pas rester muette. */}
        {!storageOk && (
          <Status
            attention
            text="Le stockage de cet appareil est illisible. Rien n’est enregistré tant que ce n’est pas résolu — restaure une sauvegarde ou réinstalle l’application."
          />
        )}

        <View style={styles.slots}>
          {Array.from({ length: MAX_RESERVATIONS }, (_, i) => (
            <View
              key={i}
              style={[
                styles.slot,
                { backgroundColor: i < used ? theme.avail[3] : theme.sunken, borderRadius: radius.sm },
              ]}
            />
          ))}
        </View>

        {bundle.reservations.slots.length === 0 ? (
          <Note>Aucun créneau enregistré.</Note>
        ) : (
          bundle.reservations.slots.map((slot, index) => (
            <View
              key={`${slot.date}-${slot.dir}-${slot.trainNo}`}
              style={[styles.line, { backgroundColor: theme.sunken, borderRadius: radius.sm }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.lineTitle, { color: theme.text }]}>
                  {slot.depart} · {longDate(slot.date)}
                </Text>
                <Text style={[styles.lineSub, { color: theme.muted }]}>
                  {dirLabel(slot.dir)} · n{slot.trainNo}
                  {slot.date < today ? ' · passé' : slot.confirmed ? ' · confirmé' : ''}
                </Text>
              </View>

              {/* Le geste n'a de sens que sur un voyage a venir pas encore confirme. */}
              {slot.date >= today && !slot.confirmed && (
                <Pressable onPress={() => confirm(index)} hitSlop={8}>
                  <Text style={[styles.lineAction, { color: theme.text }]}>confirmé</Text>
                </Pressable>
              )}

              <Pressable onPress={() => release(index)} hitSlop={8}>
                <Text style={[styles.lineAction, { color: theme.muted }]}>
                  {slot.date < today ? 'oublier' : 'libérer'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </Section>

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

      <Section title="Surveillance">
        {bundle.watchlist.watch.length === 0 && bundle.watchlist.rules.length === 0 ? (
          <Note>
            Rien de suivi. Les deux alertes générales — une date qui rouvre, un créneau qui se vide
            — partent quand même : elles ne dépendent d’aucune préférence.
          </Note>
        ) : (
          <Note>
            S’ajoute aux deux alertes générales, qui partent de toute façon.
          </Note>
        )}

        {bundle.watchlist.watch.map((entry, index) => (
          <View
            key={`${entry.date}-${entry.after ?? ''}`}
            style={[styles.line, { backgroundColor: theme.sunken, borderRadius: radius.sm }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.lineTitle, { color: theme.text }]}>{longDate(entry.date)}</Text>
              <Text style={[styles.lineSub, { color: theme.muted }]}>
                {entry.dir ? dirLabel(entry.dir) : 'les deux sens'}
                {entry.after ? ` · ${entry.after}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => unwatch(index)} hitSlop={8}>
              <Text style={[styles.lineAction, { color: theme.muted }]}>retirer</Text>
            </Pressable>
          </View>
        ))}

        {bundle.watchlist.rules.map((rule, index) => (
          <View
            key={`rule-${index}`}
            style={[styles.line, { backgroundColor: theme.sunken, borderRadius: radius.sm }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.lineTitle, { color: theme.text }]}>
                chaque {weekdayName(rule.weekday)}
              </Text>
              <Text style={[styles.lineSub, { color: theme.muted }]}>
                {rule.dir ? dirLabel(rule.dir) : 'les deux sens'}
                {rule.after ? ` · après ${rule.after}` : ''}
              </Text>
            </View>
            <Text style={[styles.lineAction, { color: theme.muted }]}>règle</Text>
          </View>
        ))}
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
          la surveillance, dans un texte que tu partages où tu veux. Sans export récent, un
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
              surveillance depuis le téléphone — la lecture, elle, n’en a pas besoin.
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
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  close: { fontSize: 14, fontWeight: '500' },
  message: { padding: space.md, marginTop: space.md },
  messageText: { fontSize: 12.5, lineHeight: 18 },
  slots: { flexDirection: 'row', gap: space.sm, marginBottom: space.xs },
  slot: { flex: 1, height: 30 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  lineTitle: { fontSize: 14, fontWeight: '600' },
  lineSub: { fontSize: 12, marginTop: 2 },
  lineAction: { fontSize: 12.5, fontWeight: '500' },
  field: { padding: 13, fontSize: 13, fontFamily: 'monospace' },
});
