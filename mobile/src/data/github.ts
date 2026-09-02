import * as SecureStore from 'expo-secure-store';
import { REPO_BRANCH, REPO_NAME, REPO_OWNER } from '../../../src/config.ts';

const API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const TOKEN_KEY = 'tgvmax_pat';

/**
 * Ecriture depuis le telephone.
 *
 * Le jeton vit dans le keystore Android via SecureStore, et non dans un simple
 * stockage cle-valeur : c'est un PAT avec droit d'ecriture sur le depot, et
 * c'est le seul endroit du projet ou un secret se trouve sur l'appareil.
 */
export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Keystore indisponible : l'application reste utilisable en lecture.
  }
}

function encodeBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function decodeBase64(input: string): string {
  const binary = globalThis.atob(input.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  if (!token) throw new Error('Aucun jeton GitHub enregistre');

  const response = await fetch(`${API}/${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`GitHub a repondu ${response.status} sur ${path}`);
  }
  return response;
}

export async function readFile<T>(path: string): Promise<{ value: T; sha: string } | null> {
  const response = await request(`${path}?ref=${REPO_BRANCH}`);
  if (response.status === 404) return null;

  const payload = (await response.json()) as { sha: string; content: string };
  return { value: JSON.parse(decodeBase64(payload.content)) as T, sha: payload.sha };
}

/**
 * Ecrit un fichier du depot.
 *
 * Le `sha` courant est relu juste avant l'envoi : le collecteur commite deux
 * fois par jour et une ecriture depuis le telephone doit pouvoir se glisser
 * entre les deux sans conflit.
 */
export async function writeFile(path: string, value: unknown, message: string): Promise<void> {
  const existing = await readFile<unknown>(path);

  const response = await request(path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: encodeBase64(`${JSON.stringify(value, null, 2)}\n`),
      branch: REPO_BRANCH,
      ...(existing ? { sha: existing.sha } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Ecriture refusee sur ${path} (HTTP ${response.status})`);
  }
}
