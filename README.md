# TGVMaxWatch

Suivi quotidien des disponibilites **MAX JEUNE** sur Paris <-> Bordeaux :
archivage de l'historique, alertes Web Push et calendrier PWA.
Repo unique, zero serveur, zero base de donnees.

Le collecteur tourne dans GitHub Actions et commite ses resultats dans ce repo.
L'application Android lit ces donnees directement depuis le depot.

## Pourquoi archiver

La source SNCF **ecrase son dataset a chaque publication** et n'offre qu'un
horizon glissant de 30 jours. Tout jour non collecte est perdu definitivement.
C'est l'archive accumulee ici — et elle seule — qui permet de repondre a
« ce train complet rouvre-t-il souvent ? » ou « les vendredis 19h partent en
combien de jours ? ».

## Architecture

| | |
|---|---|
| Collecte | GitHub Actions, cron quotidien, Node 22 + TypeScript |
| Stockage | fichiers versionnes dans le repo, commites par le bot |
| Alertes | service Expo Push, emis depuis le job cron — il *est* le backend d'envoi |
| UI | Application Android native, Expo SDK 57 + React Native |

```
src/            collecteur, diff, statistiques, envoi push
mobile/         application Expo
data/
  state.json          fraicheur de la donnee et dernier envoi push
  latest.json         dernier snapshot brut, lu par la PWA
  history.json        agregats OUI/NON par date de voyage et par sens
  stats.json          previsions, vides tant que l'echantillon est trop petit
  snapshots/          archive quotidienne gzippee (~12 ko/jour)
watchlist.json  dates et regles surveillees
reservations.json  les 6 creneaux simultanes de l'abonnement
```

`data/snapshots/` est la source de verite. `history.json` et `stats.json` en
sont des vues, **entierement recalculees a chaque execution** : un bug
d'agregation se repare en relancant le job, sans corrompre l'archive.

## Developpement

```sh
npm install
npm test          # tests sur fixtures, aucun acces reseau
npm run typecheck

# Archive synthetique de 70 jours, si la vraie collecte n'a pas encore de recul.
npm run seed

cd mobile && npm install && npx expo start
```

L'application lit les donnees directement sur `raw.githubusercontent.com` : en
natif il n'y a pas de CORS, donc rien a republier quand le collecteur commite.
Un cache fichier local permet l'ouverture hors ligne.

Les modules purs de `src/` — config, dates, duration, types, stats, watchlist —
sont importes tels quels par l'application. Metro les trouve grace au
`watchFolders` de `mobile/metro.config.js` ; ils ne doivent jamais toucher a
`node:`.

Deux variables d'environnement ouvrent la chaine reelle a un jeu de donnees de
test, sans jamais toucher a l'archive :

| | |
|---|---|
| `TGVMAX_ROOT` | racine des donnees lues et ecrites |
| `TGVMAX_DATASET_URL` | point d'entree du dataset, pour rejouer la collecte contre un faux endpoint |

Les fichiers `src/*.ts` s'executent directement (`node src/collect.ts`) : Node
22.18+ retire les annotations de type a la volee. D'ou `erasableSyntaxOnly`
dans `tsconfig.json` — ni `enum`, ni `namespace`, ni propriete de constructeur.

## Mise en service

1. Repo **public**.
2. Settings -> Actions -> General -> Workflow permissions : **Read and write**.
3. Un compte Expo, et son jeton en secret repo `EXPO_TOKEN` : le workflow
   `android` construit alors un APK telechargeable en artefact.
4. Un PAT fine-grained (`Contents: write`, ce seul repo), saisi dans les
   reglages de l'application pour editer la watchlist depuis le telephone. Il
   est range dans le keystore Android via SecureStore.

Les notifications demandent en plus des identifiants FCM : un projet Firebase,
sa cle de compte de service uploadee sur EAS, et le `google-services.json`
reference depuis `app.json`. Voir `CLAUDE.md` pour la marche a suivre.

Le cron ne se declenche que sur la branche par defaut : rien n'est collecte tant
que le collecteur n'est pas sur `main`.

## Limites connues

- Les places liberees faute de confirmation apres 17h n'apparaissent que dans le
  snapshot du lendemain matin. **Ce systeme ne peut pas faire d'alerte de
  derniere minute** ; c'est une limite de la source, pas de l'implementation.
- La donnee affichee peut avoir plus de 24h. La PWA montre toujours sa date de
  publication, et alerte au-dela de 36h.
- Les workflows planifies sont desactives apres une longue inactivite du repo.
  Verifier au bout de deux mois que la tache tourne encore.

## Source et licence

Donnees : [TGVmax](https://ressources.data.sncf.com/explore/dataset/tgvmax/),
SNCF Voyageurs, sous licence **ODbL**.
