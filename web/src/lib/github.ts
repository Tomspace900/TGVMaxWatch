import { REPO_BRANCH, REPO_NAME, REPO_OWNER } from '../../../src/config.ts';

const API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
const TOKEN_KEY = 'tgvmax.pat';

/**
 * Ecriture depuis le telephone.
 *
 * Un PAT fine-grained (`Contents: write`, ce seul repo) vit dans le
 * `localStorage`. C'est un risque assume et documente : editer du JSON a la
 * main sur un telephone est la seule alternative, et le jeton se revoque en
 * une minute en cas de perte de l'appareil.
 */
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Navigation privee ou stockage bloque : on continue en lecture seule. */
  }
}

interface ContentResponse {
  sha: string;
  content: string;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
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

/** Lit un fichier du repo. `null` s'il n'existe pas encore. */
export async function readFile<T>(path: string): Promise<{ value: T; sha: string } | null> {
  const response = await request(`${path}?ref=${REPO_BRANCH}`);
  if (response.status === 404) return null;

  const payload = (await response.json()) as ContentResponse;
  const decoded = new TextDecoder().decode(
    Uint8Array.from(atob(payload.content.replace(/\n/g, '')), (char) => char.charCodeAt(0)),
  );
  return { value: JSON.parse(decoded) as T, sha: payload.sha };
}

/**
 * Ecrit un fichier du repo.
 *
 * Le `sha` courant est relu juste avant l'envoi : le collecteur commite deux
 * fois par jour et une ecriture depuis le telephone doit pouvoir se glisser
 * entre les deux sans conflit.
 */
export async function writeFile(path: string, value: unknown, message: string): Promise<void> {
  const existing = await readFile<unknown>(path);
  const body = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  const content = btoa(String.fromCharCode(...body));

  const response = await request(path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content,
      branch: REPO_BRANCH,
      ...(existing ? { sha: existing.sha } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Ecriture refusee sur ${path} (HTTP ${response.status})`);
  }
}
