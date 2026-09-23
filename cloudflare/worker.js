/**
 * Lance la collecte des que la SNCF publie.
 *
 * La source publie chaque jour vers 04:24 UTC, a la minute pres (22 jours sur
 * 22 mesures) ; le cron GitHub partait avec 2 a 7 heures de retard. Toutes les
 * 5 minutes, ce script compare la publication de la source a celle du depot et
 * lance `collect.yml` si elles different : un lancement par l'API part dans la
 * seconde.
 *
 * Deploye par Cloudflare depuis ce dossier a chaque push (voir wrangler.toml).
 * Secret attendu, pose dans la console : GITHUB_TOKEN (Actions : ecriture,
 * Contents : lecture).
 */
const REPO = 'Tomspace900/TGVMaxWatch';
const SNCF = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax';

async function run(env) {
  const github = (path, init = {}, accept = 'application/vnd.github+json') =>
    fetch(`https://api.github.com/repos/${REPO}/${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept,
        'content-type': 'application/json',
        'user-agent': 'tgvmaxwatch-worker',
      },
    });

  // Par l'API, pas par raw.githubusercontent.com : le CDN resert l'ancien etat
  // pendant cinq minutes, et relancerait la collecte pour rien.
  const state = await github('contents/data/state.json', {}, 'application/vnd.github.raw+json');
  const collected = (await state.json()).dataProcessed;

  // Une publication par jour : une fois celle du jour prise, on ne derange plus
  // la SNCF jusqu'a demain.
  const today = new Date().toISOString().slice(0, 10);
  if (collected?.startsWith(today)) return `a jour : ${collected}`;

  const published = (await (await fetch(SNCF)).json()).metas.default.data_processed;
  if (published === collected) return `rien de neuf : ${published}`;

  const res = await github('actions/workflows/collect.yml/dispatches', {
    method: 'POST',
    body: JSON.stringify({ ref: 'main' }),
  });
  if (!res.ok) throw new Error(`lancement refuse : ${res.status} ${await res.text()}`);
  return `collecte lancee : ${collected} -> ${published}`;
}

export default {
  scheduled: (_event, env, ctx) => ctx.waitUntil(run(env)),

  // Ouvrir l'adresse du worker fait la meme chose que le cron, et dit ce qui
  // s'est passe : c'est la verification, depuis le telephone.
  fetch: async (_request, env) => {
    try {
      return new Response(await run(env));
    } catch (error) {
      return new Response(String(error), { status: 500 });
    }
  },
};
