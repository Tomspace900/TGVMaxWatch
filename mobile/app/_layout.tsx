import { View } from 'react-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '../src/data/StoreProvider.tsx';
import { useNotificationRouting } from '../src/data/notifications.ts';
import { fontAssets, useTheme } from '../src/theme.ts';

export default function RootLayout() {
  const theme = useTheme();
  useNotificationRouting();

  /*
   * Les polices sont locales : elles sont pretes en quelques dizaines de
   * millisecondes, sans reseau. Le fond neutre couvre ce temps-la — laisser
   * l'ecran se peindre avant qu'elles n'arrivent ferait sauter toute la mise en
   * page au moment de la substitution.
   *
   * `expo-font` est deja embarque dans l'APK : il est une dependance du paquet
   * `expo` lui-meme. La declarer explicitement ne change pas l'empreinte
   * native, et ces polices partent donc en OTA comme n'importe quel autre
   * changement de JS.
   */
  const [ready] = useFonts(fontAssets);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        {ready ? (
          <StoreProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.bg },
                // Les transitions natives de react-native-screens : c'est le
                // systeme qui les joue, pas nous.
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="day/[date]" />
              <Stack.Screen name="settings" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="history" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            </Stack>
          </StoreProvider>
        ) : (
          <View style={{ flex: 1, backgroundColor: theme.bg }} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
