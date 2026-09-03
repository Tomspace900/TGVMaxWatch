# TGVMaxWatch — note de reprise

Suivi quotidien des disponibilites TGVmax sur Paris Montparnasse <-> Bordeaux
Saint-Jean : archivage, alertes, application Android.

## L'invariant du projet

**La source ecrase son dataset a chaque publication.** Un jour non collecte est
perdu pour toujours, et l'archive accumulee dans `data/snapshots/` est la seule
chose que ce projet possede et que personne ne peut reconstituer. Tout le reste
— l'application, les alertes, les statistiques — se refait.

Consequence concrete, deja apprise a nos depens : `src/collect.ts` ecrit l'etat
**avant** de notifier, et l'etape de commit de `collect.yml` est en `always()`.
Une panne du canal d'alerte fait echouer le job, mais la journee est sauvee. Ne
jamais remettre la notification avant l'ecriture.

## Architecture

```
src/          collecteur Node, execute par GitHub Actions
mobile/       application Expo / React Native
data/         archive et agregats, commites par le bot
```

| | |
|---|---|
| Collecte | GitHub Actions, `15 6` et `15 8` UTC, idempotente sur `data_processed` |
| Stockage | fichiers versionnes dans le depot |
| Application | Expo SDK 57, expo-router, Reanimated 4, EAS Build + EAS Update |
| Donnees cote app | lues sur `raw.githubusercontent.com`, cache fichier pour le hors ligne |
| Alertes | service Expo Push, jeton dans `data/push-token.json` |

`data/snapshots/` est la source de verite. `history.json` et `stats.json` en
sont des vues **entierement recalculees a chaque execution** : un bug
d'agregation se repare en relancant le job.

## Regles a ne pas casser

**Les modules de `src/` importes par `mobile/` doivent rester purs.** Ce sont
`config`, `dates`, `duration`, `types`, `stats`, `watchlist` : aucun `node:`,
aucune dependance. Ils entrent dans le programme TypeScript de `mobile/` par
les imports, jamais par l'`include`.

Corollaire, tombe **deux fois** dans ce projet : ne jamais mettre
`"include": ["../src/**/*.ts"]` dans le tsconfig d'un front, et toujours y
laisser `"types": []`. Sans ces deux precautions, TypeScript remonte
l'arborescence, trouve le `@types/node` du collecteur, et la verification passe
en local pour echouer en CI. Le job `mobile` de `ci.yml` — qui n'installe que
`mobile/node_modules` — est le seul endroit ou cette divergence se voit.

**Une regle qui interprete la source vit dans `src/`, pas dans l'interface.**
`carrierLabel` a disparu avec la PWA parce qu'elle habitait le front ;
l'application affichait alors « PASUDOUEST » sur quatre lignes sur cinq. Le
champ `entity` du dataset porte un axe commercial pour les TGV INOUI et le
service pour les OUIGO : seul le second apprend quelque chose.

**Les dates de voyage sont des dates locales francaises.** Ne jamais les
convertir. Seul le cron est en UTC — d'ou le double declenchement de
`remind.yml` a 14h et 15h UTC, avec un garde-fou sur l'heure reelle a Paris.

**Les versions natives viennent de `mobile/node_modules/expo/bundledNativeModules.json`**,
jamais du `latest` de npm. Le SDK 57 veut gesture-handler 2.32 et reanimated
4.5.1 la ou npm sert 3.2 et 4.6.

**Un secret GitHub non defini arrive en chaine vide, pas en `undefined`.** `??`
ne le rattrape pas. Traiter le vide comme absent.

**Supprimer un workflow, c'est verifier qui l'appelle.** GitHub resout les
`uses: ./.github/workflows/*.yml` en parsant le fichier, pas en executant le
job : une reference pendante invalide le workflow entier. La suppression de la
PWA a ainsi emporte le job `deploy` de `collect.yml` et, avec lui, la collecte
du 2026-09-03 — sans le moindre run rouge, puisqu'un workflow invalide ne se
declenche pas et que le mail d'echec ne part donc jamais. `test/workflows.test.ts`
monte la garde depuis.

## Verifier

```sh
npm test              # 50 tests sur fixtures, aucun acces reseau
npm run typecheck
npm run seed          # archive synthetique de 70 jours si besoin de recul

cd mobile
npx tsc --noEmit
npx expo export --platform android --output-dir /tmp/export   # resolution Metro
```

Le bundle Metro est la seule verification qui attrape une resolution cassee
vers les modules partages, qui vivent hors du dossier du projet.

Le domaine `ressources.data.sncf.com` peut etre injoignable selon
l'environnement. `TGVMAX_DATASET_URL` permet de rejouer la chaine complete
contre un faux endpoint, et `TGVMAX_ROOT` de le faire sans toucher a l'archive.

## Livrer

**Changement JS** — interface, gestes, mise en page, logique metier : un push
sur `main` touchant `mobile/**` ou `src/**` declenche `update.yml`, qui publie
une mise a jour OTA de quelques centaines de kilo-octets. Elle s'applique au
redemarrage de l'application.

**Changement natif** — nouvelle dependance native, plugin de config : il faut
un nouvel APK (~108 Mo). Declencher `android.yml` (profil `preview`), ou passer
par le MCP Expo. La politique de runtime est `fingerprint` : l'ancienne
installation cesse simplement de recevoir les mises a jour au lieu de charger
du JS incompatible.

**Ne pas utiliser la boite « Build from GitHub » du tableau de bord Expo avec
ses valeurs par defaut** : elle propose `All` et `production`, ce qui produit
des builds iOS qui echouent faute de credentials et un AAB Android non
installable par sideload. Il faut Android + `preview` + base directory `mobile`.

## Ce qui reste a faire

**Notifications : cote code, c'est fait ; cote comptes, il manque FCM.**
`src/push.ts` parle au service Expo Push et l'application cree son canal
Android, affiche au premier plan et ouvre le bon jour au tap. Il reste, hors
depot :

1. un projet Firebase avec une application Android au paquet
   `com.tomspace900.tgvmaxwatch` ;
2. sa cle de compte de service uploadee sur EAS — **jamais commitee** ;
3. l'option « enhanced push security » activee sur le compte Expo.

Le `google-services.json` est en place et reference depuis `app.json`. Les
etapes Gradle de la documentation Firebase ne s'appliquent pas : ce projet
n'a pas de dossier `android/`, Expo le genere au build et y ajoute lui-meme le
plugin des services Google.

Le point 3 n'est pas cosmetique. L'API Expo accepte par defaut n'importe quel
appel non authentifie, et le jeton de notification est public dans ce depot :
sans elle, toute personne lisant le depot peut envoyer des notifications sur
l'appareil. Le collecteur signe deja ses requetes avec `EXPO_TOKEN` ; l'option
rend cette signature obligatoire.

**Le site GitHub Pages peut etre desactive** — la PWA a ete desinstallee, plus
rien n'en depend.

**Statistiques.** `stats.ts` calcule taux de reouverture, delai median de
disparition et courbe d'erosion, mais ne publie rien sous huit semaines de
collecte : des donnees brutes valent mieux qu'une estimation sur trois
observations. L'ecran `mobile/app/history.tsx` restera donc vide jusque-la.
L'archive a demarre le 2026-09-01.

**`android.yml` pourrait disparaitre.** Le depot est lie au projet Expo, donc
les builds sont declenchables directement via le MCP. Le workflow n'a ete garde
que le temps de valider ce chemin.

## Source et licence

Donnees [TGVmax](https://ressources.data.sncf.com/explore/dataset/tgvmax/),
SNCF Voyageurs, licence **ODbL**. La mention doit rester visible dans
l'application.
