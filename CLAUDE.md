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
convertir. Seul le cron est en UTC.

**Le cron de ce depot part avec trois a cinq heures de retard.** Mesure, pas
supposee : `collect` vise 06:15 UTC et part a 11:20 ; `remind` visait 14:00 et
partait a 18:24. Aucun traitement ne doit donc dependre de l'heure a laquelle
il croit tourner. Le rappel de confirmation exigeait 16h pile a Paris, ne
comptant que l'heure d'ecart entre l'ete et l'hiver : il a trouve 19h et 20h,
s'est retire quatre fois de suite, et n'est jamais parti — sans qu'un run ne
devienne rouge, puisqu'un garde-fou qui refuse sort en code 0.

La premiere reponse fut une fenetre horaire (`isParisHourWithin`) et un marqueur
dans `state.json`. Elle reduisait la probabilite de l'echec sans le supprimer,
et le laissait muet. **La bonne reponse etait de sortir la tache du cron** :
un traitement a echeance horaire appartient a l'appareil, dont l'heure locale
est celle de l'utilisateur. Le rappel est aujourd'hui une alarme posee par
`mobile/src/data/reminders.ts`, et il ne reste dans les workflows que `collect`,
dont l'idempotence rend le retard sans consequence.

**Ce qui est personnel ne va pas dans le depot.** Il est public — l'application
lit ses donnees sur `raw.githubusercontent.com` sans authentification — et
`reservations.json` y publiait dates, sens et numeros de train, c'est-a-dire
quand son proprietaire n'est pas chez lui. Les reservations vivent desormais
dans le stockage local de l'application (`mobile/src/data/local.ts`), avec un
export manuel comme seule sortie. La watchlist, elle, reste versionnee : le
collecteur ne peut pas filtrer sur un fichier qu'il ne lit pas. C'est la ligne
de partage — le depot porte ce dont le collecteur a besoin, l'appareil garde le
reste.

**Une notification doit porter ce qu'on ne peut pas deviner.** Les lignes
d'ouverture donnaient la date, l'heure, le numero de train et la duree, mais
pas le sens : « 57 places ouvertes » ne disait pas s'il s'agissait de l'aller
ou du retour. Le numero de train, lui, n'aide en rien d'un coup d'oeil. Meme
raison pour l'avant/apres d'un signal : « 7 places parties » ne dit pas s'il en
reste vingt ou deux, et c'est la seule chose qui decide s'il faut ouvrir
l'application maintenant.

**Le pari du plan sur l'entree d'une date a J+30 etait faux, et l'alerte batie
dessus ne pouvait litteralement jamais partir.** Le plan supposait qu'une date
entre dans la fenetre avec dix a quinze trains eligibles ; les quatre mesurees
sont entrees a **zero place** — 0/35, 0/39, 0/33, 0/29 — et se sont remplies le
lendemain, a J+29. Or `filterNewDates` exigeait `oui > 0` a l'entree. On
regarde donc la **transition**, jamais l'entree.

Trois mesures a garder en tete, prises sur le diff du 1er au 3 septembre :
notifier chaque train qui s'ouvre donne 12 a 13 lignes par jour, soit un
message tronque quotidien ; la disponibilite dessine un U — zero a l'entree,
montee, erosion au milieu (30 baisses contre 14 hausses entre J+12 et J+27),
remontee franche dans la derniere semaine, ou le 06/09 est passe de 1 a 17
places en un jour ; et croiser vitesse **et** rarete ramene le volume a une a
quatre lignes. Deux jours de recul seulement : a reconfirmer.

**Une regle qui amortit le bruit d'un signal ne doit pas filtrer les autres.**
La watchlist etait appliquee aux ouvertures de train *et* aux dates entrantes.
Taillee pour le premier cas, qui produit des centaines d'evenements, elle
reduisait au silence six jours sur sept un signal qui en produit un par jour.
Les deux alertes universelles — une date qui rouvre, un creneau qui se vide —
contournent desormais la watchlist entierement ; elle ne sert plus qu'aux
creneaux explicitement mis en suivi.

**Les versions natives viennent de `mobile/node_modules/expo/bundledNativeModules.json`**,
jamais du `latest` de npm. Le SDK 57 veut gesture-handler 2.32 et reanimated
4.5.1 la ou npm sert 3.2 et 4.6.

**Un secret GitHub non defini arrive en chaine vide, pas en `undefined`.** `??`
ne le rattrape pas. Traiter le vide comme absent.

**Il n'y a pas de dossier `android/` et il ne doit pas y en avoir.** Expo le
genere au moment du build. Les etapes Gradle de la documentation Firebase — qui
decrivent le chemin React Native nu, ou l'on edite `build.gradle` a la main —
ne s'appliquent donc pas : `google-services.json` est commite et declare dans
`app.json`, et Expo ajoute lui-meme le plugin des services Google a partir de
cette entree. Ce fichier ne contient que des identifiants publics, destines a
etre embarques dans l'application ; la cle de compte de service, elle, ne vit
que sur EAS.

**L'option « enhanced push security » du compte Expo ne doit jamais etre
coupee.** Le jeton de notification est public dans `data/push-token.json`, et
l'API Expo accepte par defaut n'importe quel appel non authentifie : sans cette
option, toute personne lisant le depot peut notifier l'appareil. Elle rend
obligatoire la signature que le collecteur produit deja avec `EXPO_TOKEN`.

**Supprimer un workflow, c'est verifier qui l'appelle.** GitHub resout les
`uses: ./.github/workflows/*.yml` en parsant le fichier, pas en executant le
job : une reference pendante invalide le workflow entier. La suppression de la
PWA a ainsi emporte le job `deploy` de `collect.yml` et, avec lui, la collecte
du 2026-09-03 — sans le moindre run rouge, puisqu'un workflow invalide ne se
declenche pas et que le mail d'echec ne part donc jamais. `test/workflows.test.ts`
monte la garde depuis.

## Verifier

```sh
npm test              # 70 tests sur fixtures, aucun acces reseau
npm run typecheck
npm run seed          # archive synthetique de 70 jours si besoin de recul

cd mobile
npx tsc --noEmit
npx expo export --platform android --output-dir /tmp/export   # resolution Metro
```

Le bundle Metro est la seule verification qui attrape une resolution cassee
vers les modules partages, qui vivent hors du dossier du projet.

Le canal d'alerte ne se verifie pas en lisant du code : declencher
`notify-test.yml`. Il rejoue le vrai diff des deux derniers snapshots en
ignorant la watchlist et envoie le message obtenu, sans rien ecrire. En local,
`TGVMAX_PUSH_URL` pointe le meme chemin vers un faux endpoint.

Le domaine `ressources.data.sncf.com` peut etre injoignable selon
l'environnement. `TGVMAX_DATASET_URL` permet de rejouer la chaine complete
contre un faux endpoint, et `TGVMAX_ROOT` de le faire sans toucher a l'archive.

## Livrer

**Changement JS** — interface, gestes, mise en page, logique metier : un push
sur `main` touchant `mobile/**` ou `src/**` declenche `update.yml`, qui publie
une mise a jour OTA de quelques centaines de kilo-octets. Elle s'applique au
redemarrage de l'application. La publication attend les tests du collecteur :
`ci.yml` tourne sur le meme push mais en parallele, et une mise a jour arrivee
sur le telephone ne se rattrape que par une autre mise a jour.

**Changement natif** — nouvelle dependance native, plugin de config : il faut
un nouvel APK (~108 Mo). Le depot est lie au projet Expo : le build se
declenche par le MCP, profil `preview`, base directory `mobile`. Il y a eu un
workflow `android.yml` en doublon ; il a ete supprime une fois ce chemin
verifie, parce que deux chemins pour la meme chose font deux choses a
maintenir et une seule a etre a jour. La politique de runtime est `fingerprint` : l'ancienne
installation cesse simplement de recevoir les mises a jour au lieu de charger
du JS incompatible.

**Ne pas utiliser la boite « Build from GitHub » du tableau de bord Expo avec
ses valeurs par defaut** : elle propose `All` et `production`, ce qui produit
des builds iOS qui echouent faute de credentials et un AAB Android non
installable par sideload. Il faut Android + `preview` + base directory `mobile`.

## Ce qui reste a faire

**Les notifications sont verifiees de bout en bout** — jeton enregistre depuis
l'appareil, message recu, tap qui ouvre le bon jour — le 2026-09-03. Le rappel
de confirmation, lui, n'a encore jamais eu de reservation a signaler a la
bonne heure : son premier vrai passage reste a observer.

**Statistiques.** `stats.ts` calcule taux de reouverture, delai median de
disparition et courbe d'erosion, mais ne publie rien sous huit semaines de
collecte : des donnees brutes valent mieux qu'une estimation sur trois
observations. L'ecran `mobile/app/history.tsx` restera donc vide jusque-la.
L'archive a demarre le 2026-09-01.

**Le silence est le mode de panne du projet.** Un workflow qui ne se declenche
pas n'envoie pas de mail d'echec, et une collecte manquee ne se voit nulle part
ailleurs. Le seul temoin est le bandeau de fraicheur de l'application, au-dela
de 36h. Les workflows planifies etant desactives apres une longue inactivite du
depot, verifier vers le 2026-11-01 que `collect` tourne toujours.

## Source et licence

Donnees [TGVmax](https://ressources.data.sncf.com/explore/dataset/tgvmax/),
SNCF Voyageurs, licence **ODbL**. La mention doit rester visible dans
l'application.
