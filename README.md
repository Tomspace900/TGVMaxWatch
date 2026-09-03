# TGVMaxWatch

Suivi quotidien des disponibilites **MAX JEUNE** entre Paris Montparnasse et
Bordeaux Saint-Jean : archivage de l'historique, alertes push et application
Android. Depot unique, zero serveur, zero base de donnees.

Le collecteur tourne dans GitHub Actions et commite ses resultats ici.
L'application lit ces fichiers directement depuis le depot.

## Pourquoi archiver

La source SNCF **ecrase son dataset a chaque publication** et n'offre qu'un
horizon glissant de 30 jours. Tout jour non collecte est perdu definitivement.
C'est l'archive accumulee dans `data/snapshots/` — et elle seule — qui permet
de repondre a « ce train complet rouvre-t-il souvent ? » ou « les vendredis 19h
partent en combien de jours ? ». Le reste du projet se refait ; elle, non.

## Architecture

| | |
|---|---|
| Collecte | GitHub Actions, Node 22 + TypeScript, zero dependance d'execution |
| Stockage | fichiers versionnes dans le depot, commites par le bot |
| Alertes | service Expo Push, emis depuis le job cron — il *est* le backend d'envoi |
| Application | Android, Expo SDK 57 + React Native, EAS Build et EAS Update |

```
src/            collecteur, diff, statistiques, envoi push
mobile/         application Expo
data/
  state.json          fraicheur de la donnee, dernier envoi, dernier rappel
  latest.json         dernier snapshot brut, non compresse
  history.json        observations OUI/NON par date de voyage et par sens
  stats.json          previsions, vide tant que l'echantillon est trop petit
  push-token.json     jeton Expo de l'appareil
  snapshots/          archive quotidienne gzippee (~12 ko/jour)
watchlist.json        dates et regles surveillees
reservations.json     les 6 creneaux simultanes de l'abonnement
```

`data/snapshots/` est la source de verite. `history.json` et `stats.json` en
sont des vues, **entierement recalculees a chaque execution** : un bug
d'agregation se repare en relancant le job, sans corrompre l'archive.

## Les flux

Cinq workflows, dont deux seulement se declenchent tout seuls.

| Workflow | Declenchement | Role |
|---|---|---|
| `collect` | cron `15 6` et `15 8` UTC, ou manuel | Collecte, archive, recalcule les agregats, notifie, commite |
| `remind` | cron `0 6` et `0 9` UTC, ou manuel | Rappelle de confirmer une reservation pour le lendemain |
| `ci` | push sur `main`, pull request | Typecheck et tests, cote collecteur *et* cote application |
| `update` | push sur `main` touchant `mobile/**` ou `src/**` | Publie une mise a jour OTA, apres les tests |
| `notify-test` | manuel | Envoie une notification de verification, sans rien ecrire |

**`collect`** sort immediatement si `data_processed` n'a pas bouge : les deux
passages quotidiens sont donc idempotents. Il ecrit l'archive **avant** de
notifier, et son etape de commit est en `always()` — une panne du canal
d'alerte fait echouer le job sans emporter la journee.

**`remind`** vise le milieu de matinee alors que l'echeance est a 17h, et le
code n'accepte qu'une fenetre horaire parisienne. La raison est au paragraphe
suivant.

**`update`** attend les tests du collecteur avant de publier : `ci` tourne sur
le meme push, mais en parallele, et une mise a jour OTA arrivee sur le
telephone ne se rattrape que par une autre mise a jour.

**`notify-test`** rejoue le vrai diff des deux derniers snapshots en ignorant
la watchlist, et envoie le message obtenu. Le canal d'alerte est le produit,
mais il ne se declenche qu'au hasard des ouvertures : sans ce bouton, on ne
decouvre qu'il est mort qu'en manquant l'evenement qu'il devait signaler.

### Le cron GitHub part avec plusieurs heures de retard

Mesure sur ce depot, pas suppose :

| Workflow | Cron | Depart reel | Retard |
|---|---|---|---|
| collect | 06:15 UTC | 11:20 | +5h05 |
| collect | 08:15 UTC | 12:46 | +4h31 |
| remind | 14:00 UTC | 17:28 / 18:24 | +3h28 / +4h24 |
| remind | 15:00 UTC | 18:09 | +3h09 |

**Aucun traitement ne doit donc dependre de l'heure a laquelle il croit
tourner.** Le rappel de confirmation exigeait 16h pile a Paris : il a trouve
19h et 20h, s'est retire quatre fois de suite, et n'est jamais parti — sans
qu'un seul run ne devienne rouge. Viser tot et accepter une fenetre est la
seule forme qui survit.

## Developpement

```sh
npm install
npm test          # 70 tests sur fixtures, aucun acces reseau
npm run typecheck
npm run seed      # archive synthetique de 70 jours, si besoin de recul

cd mobile && npm install
npx tsc --noEmit
npx expo export --platform android --output-dir /tmp/export
```

Le bundle Metro est la seule verification qui attrape une resolution cassee
vers les modules partages, qui vivent hors du dossier de l'application.

Les modules purs de `src/` — `config`, `dates`, `duration`, `types`, `stats`,
`watchlist` — sont importes tels quels par l'application. Metro les trouve
grace au `watchFolders` de `mobile/metro.config.js` ; ils ne doivent jamais
toucher a `node:` ni a une dependance.

Deux variables d'environnement ouvrent la chaine reelle a un jeu de donnees de
test, sans jamais toucher a l'archive :

| | |
|---|---|
| `TGVMAX_ROOT` | racine des donnees lues et ecrites |
| `TGVMAX_DATASET_URL` | point d'entree du dataset, pour rejouer la collecte contre un faux endpoint |
| `TGVMAX_PUSH_URL` | point d'envoi push, meme usage |

Les fichiers `src/*.ts` s'executent directement (`node src/collect.ts`) : Node
22.18+ retire les annotations de type a la volee. D'ou `erasableSyntaxOnly`
dans `tsconfig.json` — ni `enum`, ni `namespace`, ni propriete de constructeur,
et extensions `.ts` explicites aux imports.

## Mise en service

1. Depot **public** — l'application lit les donnees sur
   `raw.githubusercontent.com` sans authentification.
2. Settings -> Actions -> General -> Workflow permissions : **Read and write**.
3. Un compte Expo, son jeton en secret de depot `EXPO_TOKEN`. Il sert deux
   fois : signer les envois push, et publier les mises a jour OTA. Les builds
   d'APK, eux, se declenchent depuis le MCP Expo — profil `preview`, base
   directory `mobile` — et non depuis un workflow.
4. Un projet Firebase avec une application Android au paquet
   `com.tomspace900.tgvmaxwatch`, sa cle de compte de service **uploadee sur
   EAS et jamais commitee**, et l'option « enhanced push security » activee.
5. Un PAT fine-grained (`Contents: write`, ce seul depot), saisi dans les
   reglages de l'application pour ecrire la watchlist depuis le telephone. Il
   est range dans le keystore Android via SecureStore.

Le cron ne se declenche que sur la branche par defaut : rien n'est collecte
tant que le collecteur n'est pas sur `main`.

## Limites connues

- Les places liberees faute de confirmation apres 17h n'apparaissent que dans
  le snapshot du lendemain matin. **Ce systeme ne peut pas faire d'alerte de
  derniere minute** ; c'est une limite de la source, pas de l'implementation.
- La donnee affichee peut avoir plus de 24h. L'application montre toujours sa
  date de publication, et alerte au-dela de 36h. C'est le seul temoin d'une
  collecte en panne : un workflow qui ne se declenche pas n'envoie pas de mail
  d'echec.
- Les workflows planifies sont desactives apres une longue inactivite du depot.
  **Verifier au bout de deux mois que la tache tourne encore.**
- `stats.json` reste vide sous huit semaines de collecte. L'archive a demarre
  le 2026-09-01.

## Source et licence

Donnees : [TGVmax](https://ressources.data.sncf.com/explore/dataset/tgvmax/),
SNCF Voyageurs, sous licence **ODbL**. La mention doit rester visible dans
l'application.
