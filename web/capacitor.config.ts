import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tomspace900.tgvmaxwatch',
  appName: 'TGVmax',
  webDir: 'dist',

  android: {
    // La WebView reste sous la barre d'etat plutot que de passer en
    // edge-to-edge : Capacitor ne fournit pas `env(safe-area-inset-top)` sur
    // Android, et le bandeau de fraicheur passerait sous l'heure.
    adjustMarginsForEdgeToEdge: 'disable',
  },

  server: {
    // Sert l'application depuis https://localhost plutot que file:// : sans
    // cela, ni localStorage ni les requetes vers l'API GitHub ne fonctionnent
    // (origine opaque).
    androidScheme: 'https',
  },
};

export default config;
