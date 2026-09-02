import { File, Paths } from 'expo-file-system';
import { REPO_BRANCH, REPO_NAME, REPO_OWNER } from '../../../src/config.ts';

const RAW = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}`;

/**
 * Les donnees viennent directement du depot public.
 *
 * En natif il n'y a pas de CORS, donc plus besoin de republier un site chaque
 * fois que le collecteur commite : l'application lit la source telle quelle. Le
 * cache local n'est pas une optimisation mais la condition pour que l'app
 * s'ouvre pleine dans un train sans reseau — il n'y a plus de service worker
 * pour le tenir.
 */
async function cacheFile(name: string): Promise<File> {
  const file = new File(Paths.cache, `tgvmax-${name}`);
  return file;
}

async function readCache<T>(name: string): Promise<T | null> {
  try {
    const file = await cacheFile(name);
    if (!file.exists) return null;
    return JSON.parse(file.textSync()) as T;
  } catch {
    return null;
  }
}

async function writeCache(name: string, raw: string): Promise<void> {
  try {
    const file = await cacheFile(name);
    if (!file.exists) file.create({ overwrite: true });
    file.write(raw);
  } catch {
    // Un cache qui n'a pas pu s'ecrire ne doit jamais empecher l'affichage.
  }
}

export interface Fetched<T> {
  value: T;
  /** Vrai quand la valeur vient du cache local et non du reseau. */
  stale: boolean;
}

/**
 * Reseau d'abord, cache en repli.
 *
 * L'inverse — cache d'abord — ferait clignoter l'interface a chaque ouverture
 * pour une donnee qui ne change qu'une fois par jour.
 */
export async function loadJson<T>(path: string, fallback: T): Promise<Fetched<T>> {
  const name = path.replace(/\//g, '-');

  try {
    const response = await fetch(`${RAW}/${path}`, {
      headers: { 'cache-control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.text();
    const value = JSON.parse(raw) as T;
    void writeCache(name, raw);
    return { value, stale: false };
  } catch {
    const cached = await readCache<T>(name);
    return cached === null ? { value: fallback, stale: true } : { value: cached, stale: true };
  }
}
