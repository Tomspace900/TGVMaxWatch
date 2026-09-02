import { StrictMode } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles/tokens.css';
import './styles/base.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Le service worker sert le cache et recoit les messages pousses par le job
 * cron. Il ne se reveille jamais seul : sur Android il ne fait que recevoir.
 *
 * Il n'a pas lieu d'etre dans l'application native : la coquille est deja
 * locale, le cache des donnees est explicite, et le push passera par FCM.
 */
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
  });
}

/**
 * Barre d'etat.
 *
 * La WebView reste sous la barre plutot que de passer en edge-to-edge, faute
 * de `env(safe-area-inset-top)` cote Android : il ne reste qu'a lui donner la
 * couleur du theme pour que la jonction ne se voie pas.
 */
if (Capacitor.isNativePlatform()) {
  const paint = (dark: boolean) => {
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
    void StatusBar.setBackgroundColor({ color: dark ? '#0e1012' : '#f4f4f2' }).catch(() => {});
  };

  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  paint(scheme.matches);
  scheme.addEventListener('change', (event) => paint(event.matches));
}
