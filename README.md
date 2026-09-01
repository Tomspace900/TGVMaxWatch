# TGVMaxWatch

Suivi quotidien des disponibilites **MAX JEUNE** sur Paris <-> Bordeaux :
archivage de l'historique, alertes Web Push et calendrier PWA.
Repo unique, zero serveur, zero base de donnees.

Le collecteur tourne dans GitHub Actions et commite ses resultats dans ce repo.
La PWA est un site statique construit depuis `web/` et publie sur GitHub Pages.

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
| Alertes | Web Push (VAPID), emis depuis le job cron — il *est* le backend d'envoi |
| UI | PWA React/Vite statique, lit les JSON du repo, aucun backend |

```
src/            collecteur, diff, statistiques, envoi push
web/            PWA calendrier
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

# Archive synthetique pour developper la PWA sans attendre la vraie collecte
npm run seed
node scripts/sync-data.ts --from .fixture

cd web && npm install && npm run dev
```

Les fichiers `src/*.ts` s'executent directement (`node src/collect.ts`) : Node
22.18+ retire les annotations de type a la volee. D'ou `erasableSyntaxOnly`
dans `tsconfig.json` — ni `enum`, ni `namespace`, ni propriete de constructeur.

## Mise en service

1. Repo **public** et Pages active (Settings -> Pages -> Source : GitHub Actions).
2. Settings -> Actions -> General -> Workflow permissions : **Read and write**.
3. `npx web-push generate-vapid-keys`. Secrets repo `VAPID_PRIVATE_KEY` et
   `VAPID_SUBJECT` ; la cle **publique** va dans `src/config.ts`.
4. Un PAT fine-grained (`Contents: write`, ce seul repo), saisi dans la PWA pour
   editer la watchlist depuis le telephone.
5. Le gabarit de lien SNCF Connect dans `web/src/config/deeplink.ts` doit etre
   remplace par une vraie URL de recherche relevee sur le telephone.

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
