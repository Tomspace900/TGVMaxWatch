import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Site de projet GitHub Pages : tomspace900.github.io/TGVMaxWatch/
  base: '/TGVMaxWatch/',
  plugins: [react()],
  server: {
    // Les modules purs partages avec le collecteur vivent hors de web/.
    fs: { allow: ['..'] },
  },
  build: {
    target: 'es2022',
    // Un seul ecran : le decoupage en chunks n'apporte rien et coute un
    // aller-retour reseau sur un demarrage qui doit tenir sous 100 ms.
    modulePreload: { polyfill: false },
  },
});
