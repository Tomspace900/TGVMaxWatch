import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '../src/data/StoreProvider.tsx';
import { useNotificationRouting } from '../src/data/notifications.ts';
import { useTheme } from '../src/theme.ts';

export default function RootLayout() {
  const theme = useTheme();
  useNotificationRouting();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <StatusBar style={theme.dark ? 'light' : 'dark'} />
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
