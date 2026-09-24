# TGVMaxWatch

Suivi quotidien des disponibilites **MAX JEUNE** entre Paris Montparnasse
(`FRPMO`) et Bordeaux Saint-Jean (`FRBOJ`) : archivage de l'historique, alertes
push et application Android. Depot unique, zero serveur, zero base de donnees.

Pour l'usage de l'application, voir **[GUIDE.md](GUIDE.md)**. Pour les regles
apprises a nos depens et les pieges a ne pas rejouer, voir **[CLAUDE.md](CLAUDE.md)**.
Ce document-ci decrit **ce qui tourne, ce qui est recupere, et ce qu'on en fait**.

---

## 1. Pourquoi archiver

La source SNCF **ecrase son dataset a chaque publication** et n'offre qu'un
horizon glissant de 30 jours. Tout jour non collecte est perdu definitivement.
C'est l'archive accumulee dans `data/snapshots/` — et elle seule — qui permet de
repondre a « ce train complet rouvre-t-il souvent ? » ou « ce creneau part vers
J-combien ? ». Le reste du projet se refait ; elle, non.

**C'est l'invariant du projet.** Tout le reste en decoule : `collect.ts` ecrit
l'archive **avant** de notifier, et l'etape de commit est en `always()`.

---

## 2. La source

Un seul appel, tout le filtrage cote serveur.

**Metadonnees** — lues avant tout traitement :

```
GET https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax
→ metas.default.data_processed   (ISO 8601, publication ~04h20 UTC)
→ fields[]                       (colonnes declarees)
```

**Export** :

```
GET .../datasets/tgvmax/exports/json
  ?where=(origine="PARIS (intramuros)" and destination="BORDEAUX ST JEAN")
      or (origine="BORDEAUX ST JEAN" and destination="PARIS (intramuros)")
  &select=date,train_no,origine_iata,destination_iata,heure_depart,heure_arrivee,od_happy_card[,entity][,axe]
```

| | |
|---|---|
| Volume | ~2 150 lignes par jour, sur les deux sens |
| Champ decisif | `od_happy_card` : `OUI` / `NON`, binaire — **ni nombre de places, ni prix**. Tout ce que ce projet compte, ce sont donc des *trains* ouverts au TGVmax |
| Doublons | Les deux rames d'un meme depart sont **deux lignes** : 2 141 lignes se replient en 1 585 departs. Voir « L'unite de compte » ci-dessous |
| Colonnes optionnelles | `entity`, `axe` : demandees seulement si le dataset les declare, un `select` sur une colonne inconnue renvoyant 400 |
| Licence | ODbL, mention obligatoire dans l'application |

### L'unite de compte est le depart, pas la rame

La source publie une ligne par **materiel**. Deux rames qui partent a la meme
minute vers la meme gare sont deux lignes, et c'est exact de son point de vue —
mais pour qui voyage c'est un seul train. `src/departures.ts` les replie.

Mesure sur `data/latest.json` : 2 141 lignes -> **1 585 departs (-26 %)**, et
338 rames ouvertes -> **304 departs ouverts (-10 %)**. 552 departs portent deux
rames ; **jamais trois**. Aucune divergence d'heure d'arrivee, aucune de
transporteur ; seule l'eligibilite TGVmax differe, dans 53 cas — le depart est
alors reservable, mais sur une rame precise, d'ou `openTrainNos`.

Le repli se fait **a la lecture, jamais a l'ecriture** : `data/snapshots/` garde
ce que la source a publie, et une archive repliee ne se deplierait pas. Tout ce
qui est en aval — `history.json`, `stats.json`, `trains.json`, les seuils
d'alerte et l'application — compte des departs.

**Trois garde-fous a la lecture** (`src/sncf.ts`) :

- **Plancher de vraisemblance** a 500 lignes : une reponse tronquee ou un
  changement de schema ecraserait sinon un snapshot valide par un snapshot vide.
- **Filtre de gare** (`TRACKED_STATIONS`) : le filtre serveur porte sur les
  villes, et renvoie donc aussi des OUIGO Train Classique au depart
  d'Austerlitz, a plus de cinq heures. Ecartes des la collecte.
- **Reessais** avec attente croissante (2 s, 4 s, 8 s), timeout de 30 s.

---

## 3. Ce qui tourne

Trois workflows. `collect` est lance par le Worker Cloudflare, les deux autres par un push.

| Workflow | Declenchement | Role |
|---|---|---|
| `collect` | lance par le Worker Cloudflare (`cloudflare/worker.js`) des que la SNCF publie, ou manuel | Collecte, archive, recalcule, commite, reveille le telephone |
| `ci` | push sur `main`, pull request | Typecheck et tests, cote collecteur *et* cote application |
| `update` | push sur `main` touchant `mobile/**` ou `src/**` | Publie la mise a jour OTA, apres ses propres tests |

### Le declenchement

La SNCF publie chaque jour vers 04:24 UTC, a la minute pres. Le cron GitHub
partait 2 a 7 h plus tard (0 execution sur 42 a moins de 2 h). Toutes les 5
minutes, le Worker `cloudflare/worker.js` compare la publication de la source a
`data/state.json` (par l'API, pas par le CDN) et lance `collect.yml` s'il y a du
neuf ; une fois la donnee du jour prise, il ne derange plus la SNCF. Pas de
filet : une panne Cloudflare est une journee perdue, risque accepte.

Il est deploye par Cloudflare depuis `cloudflare/` a chaque push (Workers
Builds). Le cron vit dans `wrangler.toml`, le secret `GITHUB_TOKEN` (Actions :
ecriture, Contents : lecture) dans la console. Ouvrir son adresse fait la meme
chose que le cron et dit ce qui s'est passe.

Seule la **publication du jour** declenche une collecte : la SNCF republie
parfois dans la journee, et une republication de la veille vue apres minuit
lancait une collecte en pleine nuit, rangee sous la mauvaise date. Premier
passage le 2026-09-24 : publication a 04:23:44, telephone reveille a 04:31:04.

### Le collecteur, etape par etape

`src/collect.ts` :

1. Lit `data/state.json`. Si `data_processed` distant est **inchange**, sortie 0
   sans rien ecrire — un lancement en trop ne coute rien.
2. Recupere l'export, normalise, filtre les gares hors perimetre.
3. Ecrit `data/snapshots/<jour>.json.gz` et `data/latest.json`.
4. **Recalcule integralement** `history.json`, `stats.json` et `trains.json`
   depuis toute l'archive, en repliant chaque snapshot en departs une seule
   fois — toutes les vues derivees comptent ainsi la meme chose.
5. Ecrit `data/state.json`.

Il ne compose plus aucun message. L'etape de commit de `collect.yml`, en
`always()`, pousse les donnees **puis** reveille le telephone (`src/wake.ts`) :
une panne du canal d'alerte fait echouer le job apres avoir mis la journee a
l'abri.

L'etape 4 vit dans `src/derive.ts` et non plus dans `collect.ts`, et
`npm run rebuild` la lance seule. C'est ce qui rend vraie la phrase « un bug
d'agregation se repare en relancant le job » : sans point d'entree separe, un
changement de regle d'agregation laissait les vues derivees dans l'ancienne
regle jusqu'a la prochaine publication de la source, pendant que l'application
mise a jour par OTA y cherchait des cles absentes — et n'affichait rien, en
silence.

---

## 4. Les fichiers produits

```
data/
  state.json          fraicheur et compteurs                        ~200 o
  latest.json         dernier snapshot brut, non compresse          ~400 ko
  history.json        OUI/NON par date de voyage et par sens        ~9 ko
  stats.json          statistiques derivees                         ~1 ko
  trains.json         disponibilite jour par jour, train par train  ~30-85 ko
  push-token.json     jeton Expo de l'appareil                      ~110 o
  snapshots/          archive quotidienne gzippee                   ~12 ko/jour
```

`data/snapshots/` est **la source de verite**. Les quatre autres en sont des
vues **entierement recalculees a chaque execution** : un bug d'agregation se
repare en relancant le job, sans jamais corrompre l'archive.

**Les reservations ne sont pas ici.** Elles vivent dans le stockage local de
l'application, avec un export manuel comme seule sortie. Le depot est public et
elles diraient quand son proprietaire n'est pas chez lui. Le suivi non plus, pour
la meme raison : il vit sur l'appareil, et c'est le telephone qui compare.

### Formats

`latest.json` et les snapshots sont serialises **un train par ligne** :
l'indentation complete donnerait 450 ko illisibles en diff, le format compact sur
une ligne serait pire. `history.json` et `trains.json` mettent **une entree par
ligne** pour la meme raison — ajouter une date de collecte a `trains.json` en
indentation complete ferait un diff de deux mille lignes.

`trains.json` aligne chaque serie sur les dates de collecte : `O` disponible,
`N` complet, `-` absent du dataset ce jour-la. Un train qui disparait n'est pas
plein, il est supprime — travaux, greve, changement de service. La serie est
indexee par **heure de depart** et non par numero de rame : deux frises pour un
seul train n'auraient jamais ete lues.

### Retentions

| | |
|---|---|
| `HORIZON_DAYS` | 30 — horizon de la source |
| `HISTORY_RETENTION_DAYS` | 120 jours de voyage dans `history.json` |
| `TRAIN_TREND_DAYS` | 30 dates de collecte dans `trains.json`, dates de voyage a venir seulement |
| `data/snapshots/` | **jamais purge** |

---

## 5. Les alertes

Le collecteur ne sait rien de ce qui est suivi. Apres le commit, il envoie un
**reveil silencieux** : un push sans titre ni corps ni canal, qu'Android livre a
la tache de fond de l'application (`mobile/src/data/wake.ts`, via
`expo-task-manager`), meme application fermee. Le telephone relit `state.json` et
`latest.json` par l'API GitHub — pas par le CDN, qui resert l'ancien fichier
pendant cinq minutes — les compare a **la derniere donnee qu'il a vue**, pose au
plus une notification locale, puis marque le releve comme vu. Un reveil perdu
fait un message plus riche le lendemain, pas un message en moins. Seul « Forcer
l'arret » dans les reglages Android coupe ce chemin.

Tout ce qui compte est dans des modules purs de `src/`, testes sans appareil.

**Les suivis** (`src/slots.ts`). Un suivi est une fenetre datee — un sens, un
debut, une fin, qui peut passer la nuit (`jeu 24/09 18h → ven 25/09 11h`) — ou
un train seul, fenetre fermee sur son heure. Les trajets de plus de 3 h comptent
par defaut et peuvent s'ecarter. Il n'y a plus ni regle recurrente ni periode
nommee : une regle ratissait cinq jeudis pour en designer un.

| Signal | Condition | Constantes |
|---|---|---|
| `OPENED` | 0 ouvert dans la fenetre, puis ≥ 1 | `SLOT_OPEN_MIN_TRAINS = 1` |
| `FILLING` | hausse ≥ 2 **depuis** 3 trains ou moins | `SLOT_FILL_MIN_RISE = 2`, `SLOT_FILL_MAX_BEFORE = 3` |
| `DRAINING` | baisse, quelle qu'elle soit, et il en reste ≤ 2 | `SLOT_SCARCE_MAX_LEFT = 2` |
| `CLOSED` | il n'en reste plus aucun | — |

Sur un train seul, le compte vaut 0 ou 1 : seuls « ouvert » et « complet »
sortent. C'est la **rarete** qui decide d'une baisse, et la sortie de la rarete
qui decide d'une hausse : l'ancienne regle (chute ≥ 2 **et** ≤ 2 restants) ne
laissait passer que 5 des 25 mouvements mesures dans les quatorze jours, et
ratait `2 → 1` a deux jours du depart. `5 → 9` ne dit rien, `1 → 7` tout. Le
compte porte sur **tous** les trains de la fenetre, ouverts ou non — sinon une
fenetre vide n'aurait pas de compte, et « elle s'ouvre » ne pourrait jamais
etre observe. Un creneau est vide la plupart du temps (65 % a midi, 63 % le
soir, 39 % le matin) : c'est ce qui rend « il s'ouvre » utile.

**Les deux alertes generales** (`src/diff.ts`), sur le compte d'une (date,
sens), sans consulter aucun suivi.

| Signal | Condition | Constantes |
|---|---|---|
| `REOPENED` | la veille 0 train ouvert, aujourd'hui ≥ 5 | `REOPEN_MIN_TRAINS = 5` |
| `DRAINING` | perte ≥ 3 trains **et** il en reste ≤ 3 | `DRAIN_MIN_DROP = 3`, `DRAIN_MAX_LEFT = 3` |

Elles s'arretent a **quatorze jours** (`DECISION_HORIZON_DAYS`) : 8 des 11
`REOPENED` de l'archive portaient sur J+21 a J+30 et aucun sur J+0 a J+2 —
une date entre dans l'horizon a zero et se remplit le lendemain, toutes le font.
On regarde la **transition**, jamais l'entree : les quatre premieres dates
mesurees sont entrees a zero train ouvert.

**Le message** (`src/notify.ts`) : un seul par releve, six lignes au plus puis
« +N autres ». Ce qui est suivi d'abord, les alertes generales ensuite, et le
budget se prend sur elles. **Le titre est la premiere ligne**, jamais un resume
fabrique a cote — `jeu 24/09 18h → ven 25/09 11h : 1 → 7 trains` — et le corps ne
la repete pas : il commence par le sens, qui s'ecrit une fois et seulement quand
il change. Mesure sur l'archive : les titres d'avant annoncaient « 7 trains
ouverts » pendant que le jeudi utile etait trois lignes plus bas ; 25 mouvements
de creneau suivi etaient dans le corps, 2 dans le titre.

---

## 6. Les statistiques

Trois metriques, **publiees chacune des qu'elle a un echantillon** — elles ne
murissent pas au meme rythme, et un seuil global retenait la plus rapide.

| Metrique | Ce qu'elle dit | Garde |
|---|---|---|
| `reopen` | par `<sens>\|<heure de depart>`, frequence de reouverture apres fermeture | 5 fermetures observees (`MIN_REOPEN_SAMPLE`) |
| `erosion` | trains ouverts en moyenne selon la distance au depart | courbe couvrant ≥ 24 jours (`MIN_EROSION_SPAN`), soit 25 collectes (`EROSION_MIN_SNAPSHOTS`) |
| `burnRate` | mediane du **nombre de jours avant le depart** ou le train passe a `NON` | 3 instances (`MIN_BURN_SAMPLE`) |

`burnRate` mesure la **distance au depart**, pas le delai depuis la premiere
observation : cette derniere prenait pour origine la date a laquelle l'archive
avait commence a regarder, et une fonte de vingt-cinq jours en rapportait deux.
« Ce creneau part vers J-18 » est une consigne ; « part en 12 jours » n'en est
pas une tant qu'on ne sait pas depuis quand.

`reopen` est indexe par horaire **et par sens**. C'est l'horaire qui identifie
un train recurrent — le 07h12 de tous les jours — mais le 06h46 vers Bordeaux et
le 06h46 vers Paris sont deux trains : sur l'horaire seul ils tombaient dans le
meme compteur, avec un echantillon qui paraissait deux fois plus gros.

`burnRate` et `erosion` n'utilisent que des **dates de voyage deja passees** :
une date a venir n'a pas eu toute sa chance de se fermer, et ne compter que
celles qui se sont fermees selectionnerait les plus rapides.

**Regle de fond, non negociable : jamais d'estimation inventee, et toujours la
taille d'echantillon a cote du chiffre.** Corollaire cote interface : une
metrique absente doit dire **ce qui lui manque, dans son unite** — la carte
d'erosion disparaissait purement et simplement, en cachant au passage le seul
ecran capable de l'expliquer. `EROSION_MIN_SNAPSHOTS` vit dans `src/stats.ts`,
avec la garde qu'elle interprete ; l'ecran l'affiche sans jamais la recalculer.

`burnRate` et `reopen` n'ont encore **aucun ecran** : leur maturite n'a donc
nulle part ou vivre, la regle etant qu'elle appartient a l'ecran qui montre la
metrique.

---

## 7. L'application

| | |
|---|---|
| Stack | Expo SDK 57, React Native 0.86, expo-router, Reanimated 4, react-native-svg |
| Cible | Android uniquement, paquet `com.tomspace900.tgvmaxwatch` |
| Livraison | EAS Build (profil `preview`) + EAS Update (canal `preview`) |
| Runtime | politique `fingerprint` |

### Ce qu'elle lit

Six fichiers depuis `raw.githubusercontent.com`, sans authentification :
`state.json`, `latest.json`, `history.json`, `stats.json`, `trains.json`,
`push-token.json`. Le reveil, lui, relit `state.json` et `latest.json` par l'API.

Strategie **reseau d'abord, cache en repli** : l'inverse ferait clignoter
l'interface a chaque ouverture pour une donnee qui change une fois par jour. Le
cache fichier n'est pas une optimisation mais la condition pour que l'application
s'ouvre pleine dans un train sans reseau.

### Ce qu'elle ecrit

- **En local** (`AsyncStorage`) : les reservations et le suivi. Jamais ailleurs.
- **Dans le depot**, via l'API GitHub Contents avec un PAT fine-grained
  (`Contents: write`, ce seul depot) range dans le keystore Android :
  `data/push-token.json`, seul fichier dont le collecteur a besoin. Le `sha` est
  relu juste avant l'envoi, et un conflit se rejoue. Le jeton est **verifie** avant enregistrement — un PAT tronque a la
  copie se comportait sinon exactement comme un jeton absent.

### Ce qu'elle fait toute seule

- **Rappel de confirmation** : trois notifications locales pour une echeance a
  17 h. La premiere a l'**ouverture** de la fenetre de confirmation, l'avant-veille
  (`CONFIRM_OPEN_DAYS_BEFORE`, `CONFIRM_OPEN_REMINDER_HOUR`), puis deux la veille,
  a 10 h (`CONFIRM_REMINDER_HOUR`) et a 15 h (`CONFIRM_LAST_CALL_HOUR`). Celle de
  l'ouverture est la seule qui puisse **retirer le sujet de la tete** : confirmer
  annule tout le reste, et un voyage enregistre a l'avance ne coute alors qu'un
  seul message. Son instant est le **plus tard** de 19 h l'avant-veille et de
  l'ouverture des 48 h — pour un train du soir, le premier tombe encore avant le
  second, et un rappel avant que l'action soit possible n'est pas un rappel.
  Un creneau enregistre apres 15 h n'a plus aucun de ces instants devant lui : il
  recoit alors un rappel unique un quart d'heure avant l'echeance
  (`CONFIRM_LAST_MINUTES_BEFORE`) — le filet **remplace** les trois prevus, il ne
  s'y ajoute pas. Annulees par le geste « c'est confirme » ou la liberation du
  creneau. Reconciliees au demarrage, **rappel par rappel** : un creneau dont
  celui de 10 h est deja parti garde celui de 15 h sans que le premier ne se
  rejoue.
- **Alarme de fraicheur** : reposee a chaque rafraichissement reussi a
  `collectedAt + 40 h` (`STALE_ALARM_HOURS`). Tant que la donnee arrive,
  l'echeance recule. **C'est le seul dispositif capable de signaler une collecte
  morte** — une notification push est envoyee *par* le collecteur.
- **Bandeau de fraicheur** au-dela de 36 h (`STALE_DATA_HOURS`).

### Constantes d'affichage

| | |
|---|---|
| `AVAILABILITY_BUCKETS` | `[0, 1, 3, 6, 12]` — cinq paliers de couleur |
| `DURATION_DIRECT_MAX` | 140 min |
| `DURATION_INTERMEDIATE_MAX` | 180 min, au-dela le train est marque « long » |
| `MAX_RESERVATIONS` | 6, quota de reservations **simultanees** |

Une seule couleur saturee dans toute l'application : l'echelle de disponibilite.
Elle n'encode jamais autre chose.

---

## 8. Developpement

```sh
npm install
npm test          # 76 tests sur fixtures, aucun acces reseau
npm run typecheck
npm run seed      # archive synthetique de 70 jours, si besoin de recul

cd mobile && npm install
npx tsc --noEmit
npx expo export --platform android --output-dir /tmp/export
```

Le **bundle Metro est la seule verification** qui attrape une resolution cassee
vers les modules partages, qui vivent hors du dossier de l'application.

Les modules purs de `src/` — `config`, `dates`, `departures`, `diff`,
`duration`, `label`, `notify`, `slots`, `stats`, `trace`, `types`, `watchlist` —
sont importes tels quels par l'application. Metro les trouve grace au
`watchFolders` de `mobile/metro.config.js` ; **ils ne doivent jamais toucher a
`node:` ni a une dependance**. `history.ts`, lui, tire `storage.ts` et reste hors
du graphe de l'application.

Les fichiers `src/*.ts` s'executent directement (`node src/collect.ts`) : Node
22.18+ retire les annotations de type a la volee. D'ou `erasableSyntaxOnly` dans
`tsconfig.json` — ni `enum`, ni `namespace`, ni propriete de constructeur, et
extensions `.ts` explicites aux imports.

### Variables d'environnement

| | |
|---|---|
| `TGVMAX_ROOT` | racine des donnees lues et ecrites |
| `TGVMAX_DATASET_URL` | point d'entree du dataset, pour rejouer la collecte contre un faux endpoint |
| `TGVMAX_PUSH_URL` | point d'envoi push, meme usage |

Le domaine `ressources.data.sncf.com` n'est pas joignable depuis tous les
environnements : ces trois variables ouvrent la chaine reelle a un jeu de test
sans jamais toucher a l'archive.

### Secrets

| | |
|---|---|
| `EXPO_TOKEN` | secret de depot. Signe les envois push **et** publie les mises a jour OTA |
| Cle de compte de service Firebase | **uploadee sur EAS, jamais commitee** |
| PAT fine-grained | saisi dans l'application, keystore Android |

`google-services.json` est commite : il ne contient que des identifiants publics
destines a etre embarques dans l'application.

---

## 9. Livrer

**On travaille directement sur `main`, et seulement sur `main`.** Pas de branche,
pas de pull request, les commits s'empilent et le push livre dans la foulee.

**La verification passe avant le push**, et l'asymetrie explique pourquoi :
`update.yml` fait tourner son propre typecheck et ses tests avant de publier, donc
du JS casse n'atteint pas le telephone ; `collect.yml` part au signal du Worker sans rien
demander a personne, et une journee manquee est perdue pour toujours.

**Changement JS** — interface, gestes, logique metier : le push sur `main`
declenche `update.yml`, qui publie quelques centaines de kilo-octets. Elle
s'applique au **redemarrage suivant** de l'application : la premiere ouverture
telecharge, la seconde applique.

**Changement natif** — nouvelle dependance native, plugin de config : il faut un
nouvel APK (~108 Mo), declenche par le MCP Expo, profil `preview`, base directory
`mobile`. La politique `fingerprint` fait que l'ancienne installation cesse
simplement de recevoir les mises a jour au lieu de charger du JS incompatible.

**Ne pas utiliser la boite « Build from GitHub » du tableau de bord Expo avec ses
valeurs par defaut** : elle propose `All` et `production`, ce qui produit des
builds iOS qui echouent faute de credentials et un AAB Android non installable
par sideload. Il faut Android + `preview` + base directory `mobile`.

---

## 10. Mise en service

1. Depot **public** — l'application lit les donnees sans authentification.
2. Settings → Actions → General → Workflow permissions : **Read and write**.
3. Un compte Expo, son jeton en secret `EXPO_TOKEN`.
4. Un projet Firebase avec une application Android au paquet
   `com.tomspace900.tgvmaxwatch`, sa cle de compte de service uploadee sur EAS,
   et **l'option « enhanced push security » activee** — le jeton de notification
   est public dans le depot, et sans elle quiconque le lit peut notifier
   l'appareil.
5. Un PAT fine-grained saisi dans les reglages de l'application (`Contents:
   write`), pour publier le jeton de notification.
6. Le Worker Cloudflare relie au depot (Workers Builds, dossier `cloudflare`),
   avec le secret `GITHUB_TOKEN` : un PAT fine-grained `Actions: write`,
   `Contents: read` sur ce seul depot.

---

## 11. Limites connues

- Les trains liberes faute de confirmation apres 17 h n'apparaissent que dans le
  snapshot du lendemain matin. **Pas d'alerte a l'heure pres** — limite de la
  source. L'alerte a la journee pres, elle, fonctionne, et c'est la que se trouve
  le gisement : la disponibilite remonte franchement dans la derniere semaine
  avant le depart (le 06/09 Paris → Bordeaux est passe de 1 a 17 trains en un
  jour, a trois jours du depart).
- **Aucune vision au-dela de J+30.**
- La donnee affichee peut avoir plus de 24 h ; l'application montre toujours sa
  date de publication.
- Le jeton GitHub du Worker **expire** a la date choisie a sa creation : ce
  jour-la, la collecte s'arrete sans bruit, et seule l'alarme de 40 h de
  l'application le signale.
- `reopen` est calcule et publie mais **n'a encore aucune interface**.

---

## Source et licence

Donnees : [TGVmax](https://ressources.data.sncf.com/explore/dataset/tgvmax/),
SNCF Voyageurs, sous licence **ODbL**. La mention doit rester visible dans
l'application.
