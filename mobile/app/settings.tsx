import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MAX_RESERVATIONS } from '../../src/config.ts';
import { useStore } from '../src/data/store.ts';
import { getToken, setToken, writeFile } from '../src/data/github.ts';
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

  useEffect(() => {
    void getToken().then((stored) => {
      if (stored) {
        setLocalToken(stored);
        setSaved(true);
      }
    });
  }, []);

  const used = bundle.reservations.slots.length;

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

  const release = (index: number) => {
    const next: Reservations = {
      ...bundle.reservations,
      slots: bundle.reservations.slots.filter((_, i) => i !== index),
    };
    setReservations(next);
    void persist('reservations.json', next, 'resa: creneau libere');
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
              key={`${slot.date}-${slot.trainNo}`}
              style={[styles.line, { backgroundColor: theme.sunken, borderRadius: radius.sm }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.lineTitle, { color: theme.text }]}>
                  {slot.depart} · {longDate(slot.date)}
                </Text>
                <Text style={[styles.muted, { color: theme.muted }]}>
                  {dirLabel(slot.dir)} · n{slot.trainNo}
                </Text>
              </View>
              <Pressable onPress={() => release(index)} hitSlop={8}>
                <Text style={[styles.muted, { color: theme.muted }]}>libérer</Text>
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

      <Section title="Notifications" theme={theme}>
        <Text style={[styles.muted, { color: theme.muted }]}>
          {push === 'ready' && 'Jeton obtenu. Le collecteur ne l\u2019envoie pas encore : la bascule vers Expo Push attend les identifiants FCM.'}
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
