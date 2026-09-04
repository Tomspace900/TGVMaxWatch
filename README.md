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
| Colonnes optionnelles | `entity`, `axe` : demandees seulement si le dataset les declare, un `select` sur une colonne inconnue renvoyant 400 |
| Licence | ODbL, mention obligatoire dans l'application |

**Trois garde-fous a la lecture** (`src/sncf.ts`) :

- **Plancher de vraisemblance** a 500 lignes : une reponse tronquee ou un
  changement de schema ecraserait sinon un snapshot valide par un snapshot vide.
- **Filtre de gare** (`TRACKED_STATIONS`) : le filtre serveur porte sur les
  villes, et renvoie donc aussi des OUIGO Train Classique au depart
  d'Austerlitz, a plus de cinq heures. Ecartes des la collecte.
- **Reessais** avec attente croissante (2 s, 4 s, 8 s), timeout de 30 s.

---

## 3. Ce qui tourne

Quatre workflows, dont **un seul se declenche tout seul**.

| Workflow | Declenchement | Role |
|---|---|---|
| `collect` | cron `15 6` et `15 8` UTC, ou manuel | Collecte, archive, recalcule, notifie, commite |
| `ci` | push sur `main`, pull request | Typecheck et tests, cote collecteur *et* cote application |
| `update` | push sur `main` touchant `mobile/**` ou `src/**` | Publie la mise a jour OTA, apres ses propres tests |
| `notify-test` | manuel | Rejoue le dernier diff et envoie le message, sans rien ecrire |

### Le cron part avec trois a cinq heures de retard

Mesure sur ce depot, pas supposee. `collect` vise 06:15 UTC et part a 11:20 ;
08:15 part a 12:46. **Aucun traitement ne doit dependre de l'heure a laquelle il
croit tourner.** C'est pour cette raison qu'il n'y a plus de workflow de rappel :
un traitement a echeance horaire appartient a l'appareil, dont l'heure locale est
celle de l'utilisateur. Seul `collect` reste, et son idempotence rend le retard
sans consequence.

### Le collecteur, etape par etape

`src/collect.ts` :

1. Lit `data/state.json`. Si `data_processed` distant est **inchange**, sortie 0
   sans rien ecrire — c'est ce qui rend les deux passages quotidiens gratuits.
2. Recupere l'export, normalise, filtre les gares hors perimetre.
3. Lit le **snapshot precedent** (le plus recent qui ne soit pas celui du jour)
   avant d'ecrire, sans quoi le diff comparerait le nouveau fichier a lui-meme.
4. Ecrit `data/snapshots/<jour>.json.gz` et `data/latest.json`.
5. **Recalcule integralement** `history.json`, `stats.json` et `trains.json`
   depuis toute l'archive.
6. Ecrit `data/state.json` — **avant** la notification.
7. Diffe, filtre, envoie au plus un message.

L'etape de commit est en `always()` : une panne du canal d'alerte fait echouer le
job **apres** avoir mis les donnees a l'abri.

---

## 4. Les fichiers produits

```
data/
  state.json          fraicheur, dernier envoi push, compteurs      ~220 o
  latest.json         dernier snapshot brut, non compresse          ~400 ko
  history.json        OUI/NON par date de voyage et par sens        ~9 ko
  stats.json          statistiques derivees                         ~1 ko
  trains.json         disponibilite jour par jour, train par train  ~30-85 ko
  push-token.json     jeton Expo de l'appareil                      ~110 o
  snapshots/          archive quotidienne gzippee                   ~12 ko/jour
watchlist.json        dates et regles surveillees
```

`data/snapshots/` est **la source de verite**. Les quatre autres en sont des
vues **entierement recalculees a chaque execution** : un bug d'agregation se
repare en relancant le job, sans jamais corrompre l'archive.

**Les reservations ne sont pas ici.** Elles vivent dans le stockage local de
l'application, avec un export manuel comme seule sortie. Le depot est public et
elles diraient quand son proprietaire n'est pas chez lui. La watchlist, elle,
reste versionnee : le collecteur ne peut pas filtrer sur un fichier qu'il ne lit
pas.

### Formats

`latest.json` et les snapshots sont serialises **un train par ligne** :
l'indentation complete donnerait 450 ko illisibles en diff, le format compact sur
une ligne serait pire. `history.json` et `trains.json` mettent **une entree par
ligne** pour la meme raison — ajouter une date de collecte a `trains.json` en
indentation complete ferait un diff de deux mille lignes.

`trains.json` aligne chaque serie sur les dates de collecte : `O` disponible,
`N` complet, `-` absent du dataset ce jour-la. Un train qui disparait n'est pas
plein, il est supprime — travaux, greve, changement de service.

### Retentions

| | |
|---|---|
| `HORIZON_DAYS` | 30 — horizon de la source |
| `HISTORY_RETENTION_DAYS` | 120 jours de voyage dans `history.json` |
| `TRAIN_TREND_DAYS` | 30 dates de collecte dans `trains.json`, dates de voyage a venir seulement |
| `data/snapshots/` | **jamais purge** |

---

## 5. Les alertes

Le diff (`src/diff.ts`) produit deux choses de **mailles differentes**.

**Des evenements par train** — `OPEN`, `CLOSE`, `REMOVED` — passes par la
watchlist. Ce sont les creneaux explicitement mis en suivi.

**Des signaux par (date, sens)** — la maille a laquelle on decide de partir.
Ils **contournent la watchlist** : ils ne dependent d'aucune preference.

| Signal | Condition | Constantes |
|---|---|---|
| `REOPENED` | la veille 0 train ouvert, aujourd'hui ≥ 5 | `REOPEN_MIN_TRAINS = 5` |
| `DRAINING` | perte ≥ 3 trains **et** il en reste ≤ 3 | `DRAIN_MIN_DROP = 3`, `DRAIN_MAX_LEFT = 3` |

Les seuils viennent de l'archive reelle, pas d'une intuition. Mesure sur le diff
du 1er au 3 septembre : notifier chaque train qui s'ouvre donne **12 a 13 lignes
par jour**, soit un message tronque quotidien et un canal mort en trois semaines.
Ces deux regles en donnent **une a quatre**, toutes actionnables.

**Le pari initial du projet etait faux.** Le plan misait sur l'entree d'une date
a J+30, supposee arriver avec dix a quinze trains. Les quatre dates mesurees sont
entrees a **zero train ouvert** (0/35, 0/39, 0/33, 0/29) et se sont remplies le
lendemain. L'alerte batie dessus exigeait `oui > 0` a l'entree : elle ne pouvait
litteralement jamais partir. On regarde donc la **transition**, jamais l'entree.

**Le message** (`src/notify.ts`) : un seul par execution, six lignes maximum puis
« +N autres », plafonne a 3 500 octets. Chaque ligne porte le **sens** — la seule
chose qu'on ne peut pas deviner — et l'**avant/apres** : « 9 trains hier, 2
aujourd'hui » decide, « 7 trains partis » non. Les suppressions de train ne sont
jamais poussees, trop de bruit pour leur interet.

**L'envoi** passe par le service Expo Push, signe avec `EXPO_TOKEN`. Le job cron
*est* le backend d'envoi.

---

## 6. Les statistiques

Trois metriques, **publiees chacune des qu'elle a un echantillon** — elles ne
murissent pas au meme rythme, et un seuil global retenait la plus rapide.

| Metrique | Ce qu'elle dit | Garde |
|---|---|---|
| `reopen` | par numero de train, frequence de reouverture apres fermeture | 5 fermetures observees (`MIN_REOPEN_SAMPLE`) |
| `erosion` | trains ouverts en moyenne selon la distance au depart | courbe couvrant ≥ 24 jours (`MIN_EROSION_SPAN`) |
| `burnRate` | mediane du **nombre de jours avant le depart** ou le train passe a `NON` | 3 instances (`MIN_BURN_SAMPLE`) |

`burnRate` mesure la **distance au depart**, pas le delai depuis la premiere
observation : cette derniere prenait pour origine la date a laquelle l'archive
avait commence a regarder, et une fonte de vingt-cinq jours en rapportait deux.
« Ce creneau part vers J-18 » est une consigne ; « part en 12 jours » n'en est
pas une tant qu'on ne sait pas depuis quand.

`burnRate` et `erosion` n'utilisent que des **dates de voyage deja passees** :
une date a venir n'a pas eu toute sa chance de se fermer, et ne compter que
celles qui se sont fermees selectionnerait les plus rapides.

**Regle de fond, non negociable : jamais d'estimation inventee, et toujours la
taille d'echantillon a cote du chiffre.**

---

## 7. L'application

| | |
|---|---|
| Stack | Expo SDK 57, React Native 0.86, expo-router, Reanimated 4, react-native-svg |
| Cible | Android uniquement, paquet `com.tomspace900.tgvmaxwatch` |
| Livraison | EAS Build (profil `preview`) + EAS Update (canal `preview`) |
| Runtime | politique `fingerprint` |

### Ce qu'elle lit

Sept fichiers depuis `raw.githubusercontent.com`, sans authentification :
`state.json`, `latest.json`, `history.json`, `stats.json`, `trains.json`,
`push-token.json`, `watchlist.json`.

Strategie **reseau d'abord, cache en repli** : l'inverse ferait clignoter
l'interface a chaque ouverture pour une donnee qui change une fois par jour. Le
cache fichier n'est pas une optimisation mais la condition pour que l'application
s'ouvre pleine dans un train sans reseau.

### Ce qu'elle ecrit

- **En local** (`AsyncStorage`) : les reservations. Jamais ailleurs.
- **Dans le depot**, via l'API GitHub Contents avec un PAT fine-grained
  (`Contents: write`, ce seul depot) range dans le keystore Android :
  `watchlist.json` et `data/push-token.json`. Le `sha` est relu juste avant
  l'envoi, pour qu'une ecriture depuis le telephone se glisse entre deux commits
  du bot. Le jeton est **verifie** avant enregistrement — un PAT tronque a la
  copie se comportait sinon exactement comme un jeton absent.

### Ce qu'elle fait toute seule

- **Rappel de confirmation** : notification locale a 10 h la veille d'un voyage
  enregistre (`CONFIRM_DAYS_BEFORE = 1`, echeance 17 h). Annulee par le geste
  « c'est confirme » ou la liberation du creneau. Reconciliee au demarrage.
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

Les modules purs de `src/` — `config`, `dates`, `duration`, `types`, `stats`,
`watchlist` — sont importes tels quels par l'application. Metro les trouve grace
au `watchFolders` de `mobile/metro.config.js` ; **ils ne doivent jamais toucher a
`node:` ni a une dependance**. `diff.ts` et `history.ts`, eux, tirent `storage.ts`
et restent donc hors du graphe de l'application.

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
du JS casse n'atteint pas le telephone ; `collect.yml` part au cron sans rien
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
5. Un PAT fine-grained saisi dans les reglages de l'application.

Le cron ne se declenche que sur la branche par defaut.

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
- Les workflows planifies sont **desactives apres une longue inactivite du
  depot**. Verifier au bout de deux mois que la tache tourne encore.
- `reopen` est calcule et publie mais **n'a encore aucune interface**.

---

## Source et licence

Donnees : [TGVmax](https://ressources.data.sncf.com/explore/dataset/tgvmax/),
SNCF Voyageurs, sous licence **ODbL**. La mention doit rester visible dans
l'application.
