import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MAX_RESERVATIONS } from '../../src/config.ts';
import { todayInParis } from '../../src/dates.ts';
import { useStore } from '../src/data/store.ts';
import { getToken, setToken, writeFile } from '../src/data/github.ts';
import { exportLocalState, parseExport } from '../src/data/local.ts';
import { cancelConfirmReminder, syncConfirmReminders } from '../src/data/reminders.ts';
import { requestPushToken, type PushStatus } from '../src/data/push.ts';
import { dirLabel, longDate, weekdayName } from '../src/format.ts';
import { radius, space, useTheme } from '../src/theme.ts';
import type { Reservations, Watchlist } from '../../src/types.ts';

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bundle, setWatchlist, setReservations } = useStore();

  const [token, setLocalToken] = useState('');
  const [saved, setSaved] = useState(false);
  const [push, setPush] = useState<PushStatus>('off');
  const [message, setMessage] = useState<string | null>(null);
  const [restore, setRestore] = useState('');

  useEffect(() => {
    void getToken().then((stored) => {
      if (stored) {
        setLocalToken(stored);
        setSaved(true);
      }
    });
  }, []);

  const today = todayInParis();

  /*
   * Le quota TGVmax porte sur les reservations *simultanees* : un creneau se
   * libere quand le train est passe. Les voyages deja faits restent affiches —
   * c'est un historique qu'on ne jette pas — mais ils ne comptent plus.
   */
  const upcoming = bundle.reservations.slots.filter((slot) => slot.date >= today);
  const used = upcoming.length;

  const persist = async (path: string, value: unknown, note: string) => {
    try {
      await writeFile(path, value, note);
      setMessage('Enregistré dans le dépôt.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const unwatch = (index: number) => {
    const next: Watchlist = {
      ...bundle.watchlist,
      watch: bundle.watchlist.watch.filter((_, i) => i !== index),
    };
    setWatchlist(next);
    void persist('watchlist.json', next, 'watchlist: retrait');
  };

  /** Le creneau disparait, et le rappel qui l'accompagnait avec lui. */
  const release = (index: number) => {
    const removed = bundle.reservations.slots[index];
    const next: Reservations = {
      slots: bundle.reservations.slots.filter((_, i) => i !== index),
    };
    setReservations(next);
    if (removed) void cancelConfirmReminder(removed);
  };

  /**
   * « C'est confirmé ».
   *
   * Le champ `confirmed` etait ecrit `false` a la creation et jamais relu :
   * il porte desormais un vrai geste, dont le seul effet visible est de faire
   * taire un rappel devenu inutile.
   */
  const confirm = (index: number) => {
    const slot = bundle.reservations.slots[index];
    if (!slot) return;
    const next: Reservations = {
      slots: bundle.reservations.slots.map((entry, i) =>
        i === index ? { ...entry, confirmed: true } : entry,
      ),
    };
    setReservations(next);
    void cancelConfirmReminder(slot);
  };

  const exportState = () => {
    void Share.share({
      message: exportLocalState(bundle.reservations, bundle.watchlist),
    });
  };

  const importState = () => {
    const parsed = parseExport(restore.trim());
    if (!parsed) {
      setMessage('Sauvegarde illisible : rien n’a été modifié.');
      return;
    }
    setReservations(parsed.reservations);
    setWatchlist(parsed.watchlist);
    void syncConfirmReminders(parsed.reservations.slots);
    void persist('watchlist.json', parsed.watchlist, 'watchlist: restauration');
    setRestore('');
    setMessage(`${parsed.reservations.slots.length} créneaux restaurés.`);
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + space.lg,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.lg,
      }}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]}>Réglages</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.close, { color: theme.muted }]}>fermer</Text>
        </Pressable>
      </View>

      <Section title={`Quota — ${used} / ${MAX_RESERVATIONS} reservations`} theme={theme}>
        <View style={styles.slots}>
          {Array.from({ length: MAX_RESERVATIONS }, (_, i) => (
            <View
              key={i}
              style={[
                styles.slot,
                {
                  backgroundColor: i < used ? theme.avail[3] : theme.sunken,
                  borderRadius: radius.sm,
                },
              ]}
            />
          ))}
        </View>

        {bundle.reservations.slots.length === 0 ? (
          <Text style={[styles.muted, { color: theme.muted }]}>Aucun créneau occupé.</Text>
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
                <Text style={[styles.muted, { color: theme.muted }]}>
                  {dirLabel(slot.dir)} · n{slot.trainNo}
                  {slot.date < today ? ' · voyage passé' : slot.confirmed ? ' · confirmé' : ''}
                </Text>
              </View>

              {/* Le geste n'a de sens que sur un voyage a venir pas encore confirme. */}
              {slot.date >= today && !slot.confirmed && (
                <Pressable onPress={() => confirm(index)} hitSlop={8}>
                  <Text style={[styles.muted, { color: theme.text }]}>confirmé</Text>
                </Pressable>
              )}

              <Pressable onPress={() => release(index)} hitSlop={8}>
                <Text style={[styles.muted, { color: theme.muted }]}>
                  {slot.date < today ? 'oublier' : 'libérer'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </Section>

      <Section title="Surveillance" theme={theme}>
        {bundle.watchlist.watch.length === 0 && bundle.watchlist.rules.length === 0 && (
          <Text style={[styles.muted, { color: theme.muted }]}>
            Rien de surveillé : aucune notification ne partira.
          </Text>
        )}

        {bundle.watchlist.watch.map((entry, index) => (
          <View
            key={`${entry.date}-${entry.after ?? ''}`}
            style={[styles.line, { backgroundColor: theme.sunken, borderRadius: radius.sm }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.lineTitle, { color: theme.text }]}>{longDate(entry.date)}</Text>
              <Text style={[styles.muted, { color: theme.muted }]}>
                {entry.dir ? dirLabel(entry.dir) : 'les deux sens'}
                {entry.after ? ` · ${entry.after}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => unwatch(index)} hitSlop={8}>
              <Text style={[styles.muted, { color: theme.muted }]}>retirer</Text>
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
              <Text style={[styles.muted, { color: theme.muted }]}>
                {rule.dir ? dirLabel(rule.dir) : 'les deux sens'}
                {rule.after ? ` · apres ${rule.after}` : ''}
              </Text>
            </View>
            <Text style={[styles.muted, { color: theme.muted }]}>règle</Text>
          </View>
        ))}
      </Section>

      <Section title="Sauvegarde" theme={theme}>
        <Text style={[styles.muted, { color: theme.muted }]}>
          Tes r\u00e9servations vivent sur cet appareil et nulle part ailleurs. L\u2019export les copie, avec
          la surveillance, dans un texte que tu partages o\u00f9 tu veux. Rien ne sort d\u2019ici sans ce
          geste \u2014 et sans export r\u00e9cent, un t\u00e9l\u00e9phone perdu emporte la liste (les r\u00e9servations
          elles-m\u00eames restent chez SNCF).
        </Text>

        <Pressable
          style={[styles.button, { backgroundColor: theme.inverseBg, borderRadius: radius.sm }]}
          onPress={exportState}
        >
          <Text style={[styles.buttonText, { color: theme.inverseText }]}>Exporter</Text>
        </Pressable>

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
            { backgroundColor: theme.sunken, color: theme.text, borderRadius: radius.sm, minHeight: 72 },
          ]}
        />

        {restore.trim().length > 0 && (
          <Pressable
            style={[styles.button, { backgroundColor: theme.sunken, borderRadius: radius.sm }]}
            onPress={importState}
          >
            <Text style={[styles.buttonText, { color: theme.text }]}>Restaurer</Text>
          </Pressable>
        )}
      </Section>

      <Section title="Notifications" theme={theme}>
        <Text style={[styles.muted, { color: theme.muted }]}>
          {push === 'ready' && 'Jeton enregistr\u00e9. Le collecteur signe ses envois et pousse les alertes sur cet appareil.'}
          {push === 'off' && "Pas encore de jeton sur cet appareil."}
          {push === 'denied' && 'Permission refusée.'}
          {push === 'unsupported' && "Indisponible ici : il faut un vrai appareil et un build EAS."}
        </Text>

        {push !== 'ready' && (
          <Pressable
            style={[styles.button, { backgroundColor: theme.inverseBg, borderRadius: radius.sm }]}
            onPress={() => {
              void requestPushToken().then(async ({ status, token: expoToken }) => {
                setPush(status);
                if (expoToken) {
                  await persist(
                    'data/push-token.json',
                    { expoPushToken: expoToken, updatedAt: new Date().toISOString() },
                    'push: jeton Expo',
                  );
                }
              });
            }}
          >
            <Text style={[styles.buttonText, { color: theme.inverseText }]}>Activer les notifications</Text>
          </Pressable>
        )}
      </Section>

      <Section title="Jeton GitHub" theme={theme}>
        <Text style={[styles.muted, { color: theme.muted }]}>
          Un PAT fine-grained avec Contents: write sur ce seul dépôt. Il est rangé dans le keystore
          Android, pas dans un simple stockage clé-valeur. À révoquer en cas de perte de l’appareil.
        </Text>

        <TextInput
          value={token}
          onChangeText={setLocalToken}
          placeholder="github_pat_..."
          placeholderTextColor={theme.muted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.field,
            { backgroundColor: theme.sunken, color: theme.text, borderRadius: radius.sm },
          ]}
        />

        <Pressable
          style={[styles.button, { backgroundColor: theme.sunken, borderRadius: radius.sm }]}
          onPress={() => {
            const trimmed = token.trim();
            void setToken(trimmed || null);
            setSaved(trimmed.length > 0);
            setMessage(trimmed ? 'Jeton enregistré.' : 'Jeton effacé.');
          }}
        >
          <Text style={[styles.buttonText, { color: theme.text }]}>
            {saved ? 'Remplacer le jeton' : 'Enregistrer'}
          </Text>
        </Pressable>

        {message && <Text style={[styles.muted, { color: theme.muted }]}>{message}</Text>}
      </Section>

      <Section title="Archive" theme={theme}>
        <Text style={[styles.muted, { color: theme.muted }]}>
          {bundle.state.snapshotCount} snapshots collectés, {bundle.state.recordCount} lignes au
          dernier.
          {bundle.stats?.ready
            ? ' Prévisions actives.'
            : " Prévisions inactives : pas encore assez de recul, les données brutes sont affichées telles quelles."}
        </Text>
        <Text style={[styles.muted, { color: theme.muted, marginTop: space.md }]}>
          Données TGVmax, SNCF Voyageurs, licence ODbL.
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  theme,
  children,
}: {
  title: string;
  theme: { text: string; line: string };
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { borderBottomColor: theme.line }]}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  close: { fontSize: 14, fontWeight: '500' },
  section: { paddingVertical: space.lg, borderBottomWidth: StyleSheet.hairlineWidth, gap: space.sm },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: space.xs },
  slots: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  slot: { flex: 1, height: 30 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  lineTitle: { fontSize: 14, fontWeight: '600' },
  muted: { fontSize: 12.5, lineHeight: 18 },
  field: { padding: 13, fontSize: 13, fontFamily: 'monospace' },
  button: { padding: 13, alignItems: 'center' },
  buttonText: { fontSize: 14, fontWeight: '600' },
});
