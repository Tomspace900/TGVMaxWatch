# tgvmax-watch — plan de réalisation

Suivi quotidien des disponibilités MAX JEUNE sur Paris ↔ Bordeaux, avec historique,
alertes Telegram et calendrier PWA. Repo unique, zéro serveur, zéro base de données.

---

## 1. Contraintes qui dictent l'architecture

| Contrainte | Conséquence |
|---|---|
| La source ne change qu'1×/jour (traitement ~04h20 UTC) | Cron quotidien, pas de polling. |
| Le dataset est écrasé à chaque publication | L'historique doit être archivé par nous, dès aujourd'hui. |
| Horizon glissant de 30 jours | Aucune vision au-delà de J+30. |
| Donnée binaire `od_happy_card` (OUI/NON) | Pas de nombre de places, pas de prix. Le calendrier compte des **trains éligibles**. |
| 2172 lignes/snapshot, 12,6 ko gzippés | Le repo git *est* la base de données (~4,6 Mo/an). |
| Un seul utilisateur | Telegram, pas de Web Push (pas d'auth, pas de store d'abonnements). |

## 2. Décisions arrêtées

- **Runtime** : GitHub Actions (cron), Node 22 + TypeScript, `fetch` natif, aucune dépendance.
- **Stockage** : fichiers versionnés dans le repo, commités par le bot.
- **Alertes** : bot Telegram, un POST HTTP depuis l'Action.
- **UI** : PWA React/Vite statique, lit les JSON du repo. Aucun backend.
- **Config** : `watchlist.json` éditable depuis l'UI web GitHub sur téléphone.

## 3. Source de données (validée)

Un seul appel, tout le filtrage côté serveur :

```
GET https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/exports/json
  ?where=(origine="PARIS (intramuros)" and destination="BORDEAUX ST JEAN")
      or (origine="BORDEAUX ST JEAN" and destination="PARIS (intramuros)")
  &select=date,train_no,origine_iata,destination_iata,heure_depart,heure_arrivee,od_happy_card
```

Retour : tableau JSON, ~2172 objets.

```json
{ "date": "2026-09-03", "train_no": "8441", "origine_iata": "FRPMO",
  "destination_iata": "FRBOJ", "heure_depart": "06:06",
  "heure_arrivee": "09:02", "od_happy_card": "OUI" }
```

Fraîcheur à vérifier avant tout traitement :

```
GET https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax
→ metas.default.data_processed  (ISO 8601)
```

Codes gares : `FRPMO` Paris Montparnasse, `FRBOJ` Bordeaux St-Jean.
Licence ODbL : mentionner la source SNCF dans le README et dans la PWA.

## 4. Arborescence

```
.github/workflows/collect.yml
src/collect.ts        # fetch + archive + agrégats
src/diff.ts           # comparaison n / n-1
src/notify.ts         # Telegram
watchlist.json        # config utilisateur
reservations.json     # 6 créneaux, sens du dernier trajet, rappels 16h
data/
  state.json          # { lastDataProcessed, lastRun }
  snapshots/2026-09-01.json.gz
  latest.json         # dernier snapshot brut (PWA)
  history.json        # agrégats par date de voyage (PWA)
web/                  # PWA (phase 2)
```

`history.json` — une entrée par (date de voyage, sens), série d'observations :

```json
{
  "2026-10-17": {
    "FRPMO>FRBOJ": [ { "d": "2026-09-17", "oui": 12, "non": 24 },
                     { "d": "2026-09-18", "oui": 10, "non": 26 } ],
    "FRBOJ>FRPMO": [ ... ]
  }
}
```

Purge : supprimer les dates de voyage antérieures à J-120.

---

## Phase 0 — Collecteur (à faire en premier, aujourd'hui)

1. Repo privé `tgvmax-watch`, Node 22, TS, exécution via `node --experimental-strip-types`.
2. `src/collect.ts` :
   - lit `data/state.json` ; si `data_processed` distant == celui stocké → sortie code 0 sans rien écrire (**idempotence**) ;
   - fetch de l'export, échec bruyant si < 500 lignes (garde-fou contre une réponse tronquée) ;
   - écrit `data/snapshots/<date_du_jour>.json.gz` et `data/latest.json` ;
   - met à jour `data/history.json` (compte OUI/NON par date de voyage et par sens) ;
   - met à jour `data/state.json`.
3. `.github/workflows/collect.yml` : `schedule` à `15 6 * * *` **et** `15 8 * * *` UTC, plus `workflow_dispatch`. Commit et push par le bot avec `[skip ci]` dans le message.

**Critère de réussite** : au bout de 3 jours, 3 snapshots distincts dans `data/snapshots/`, et `history.json` contient 3 observations pour chaque date de voyage.

## Phase 1 — Alertes Web Push (dans l'app)

1. Générer une paire de clés VAPID. Secret repo : `VAPID_PRIVATE_KEY` (la clé publique va dans le
   front). L'abonnement push est produit par la PWA une fois installée et commité dans
   `data/push-subscription.json` (voir phase 2, point 3). Envoi depuis l'Action avec `web-push`.
   Aucun serveur : le job cron *est* le backend d'envoi.
2. `watchlist.json` :

```json
{
  "watch": [
    { "date": "2026-10-17", "dir": "FRPMO>FRBOJ", "after": "16:00" },
    { "date": "2026-10-19", "dir": "FRBOJ>FRPMO" }
  ],
  "rules": [
    { "weekday": "fri", "dir": "FRPMO>FRBOJ", "after": "16:00" }
  ]
}
```

3. `src/diff.ts` compare le snapshot du jour au précédent, clé = `date|train_no|dir`.
   Trois événements : `NON→OUI` (ouverture), `OUI→NON` (fermeture), `nouvelle date à J+30`.
4. Notification **uniquement** si l'événement concerne une entrée `watch` ou matche une `rule`.
   Aucun message si rien ne matche. Un seul message groupé par exécution.

**Critère de réussite** : une semaine sans notification inutile. Si tu reçois un message par jour, la règle est trop large — resserre-la, ne baisse pas le volume en la muant.

## Phase 2 — PWA calendrier

Vite + React + TS dans `web/`, build et déploiement GitHub Pages par un second workflow.
Lecture directe de `data/latest.json` et `data/history.json` (mêmes origines, chemins relatifs).

### Noyau

- Grille 30 jours, une case = un jour de voyage, couleur = nombre de trains OUI dans le sens sélectionné (0 / 1-2 / 3-5 / 6+).
- Badge delta vs snapshot précédent (`-3` en rouge, `+2` en vert).
- Tap sur un jour → liste des trains (heure, n°, dispo) + courbe de l'évolution issue de `history.json`.
- Toggle de sens, manifest + icônes pour l'installation Android.
- Afficher en clair la date du `data_processed` : la donnée peut avoir plus de 24 h.
  Bandeau d'avertissement si elle dépasse 36 h (collecteur en panne).

### Fonctionnalités à forte valeur pour cet usage

1. **Alternance de sens** (prioritaire). Les trajets sont unitaires, pas des allers-retours, mais
   ils alternent : si la dernière réservation était Paris → Bordeaux, la suivante sera l'inverse.
   `reservations.json` mémorise le sens du dernier trajet ; l'app s'ouvre par défaut sur le sens attendu.
   Pas de vue « week-end », pas d'appariement aller/retour.
2. **Durée de trajet comme signal visuel fort**. Sur cet axe les temps vont de ~2h05 à ~3h30 selon
   les arrêts. Un 3h30 reste réservable — il ne doit pas disparaître — mais il doit être
   immédiatement identifiable comme un mauvais choix : durée en toutes lettres, traitement
   d'avertissement marqué sur la ligne, jamais un simple détail gris.
   Trois paliers : direct (~2h05-2h20), intermédiaire, long (> 3h).
   Le compteur du calendrier compte tous les trains disponibles, mais une case dont les places sont
   toutes des trains longs doit le montrer (marqueur d'angle), sinon la couleur ment.
3. **Alerte « nouvelle date à J+30 »**. Chaque matin une date entre dans la fenêtre, et c'est
   statistiquement le moment où il y a le plus de places (~10-15 trains contre 1-3 à J-10).
   Notification si la date entrante matche une règle de la watchlist. C'est l'alerte à plus fort rendement du projet.
4. **Éditeur de watchlist dans la PWA**. Écriture de `watchlist.json` via l'API GitHub
   (fine-grained PAT, scope « Contents: write » sur ce seul repo, stocké en `localStorage`).
   Évite d'éditer du JSON à la main sur téléphone. Risque assumé : un jeton dans le
   `localStorage` du téléphone — acceptable pour un repo privé mono-utilisateur, à révoquer en cas de perte du tél.
5. **Rappel de confirmation par push, pas par `.ics`**. Bouton « j'ai réservé » sur une ligne de train
   → écriture dans `reservations.json`. Un second workflow tourne à 16h Europe/Paris et pousse
   « confirme ta résa du 27/09 avant 17h ». Réutilise l'infrastructure push existante, ne dépend
   d'aucun calendrier tiers, et alimente le compteur de quota.
   Garder un export `.ics` en option secondaire pour l'événement du trajet lui-même.
6. **Compteur des 6 réservations simultanées**. Contrainte réelle de l'abonnement. Affiche les
   créneaux occupés et lequel libérer quand une meilleure date s'ouvre.
7. **Timeline de disparition** d'une date : « ce train est parti le 12/09 », utile pour calibrer
   à quel moment il faut réserver.

À ne pas faire : comptes, partage, stats réseau nationales, thèmes. C'est un outil mono-utilisateur.

### Fonctionnalités exotiques retenues

1. **Écran « ce soir / demain »**. Le snapshot du matin contient précisément les places libérées la
   veille à 17h par les non-confirmations. C'est la seule façon légitime de capter le dernier
   moment avec cette source. Vue dédiée J0/J+1, notification matinale : « 4 places libérées pour ce soir ».
   Réconcilie l'envie de dernière minute avec la contrainte de fraîcheur.
2. **Taux de réouverture par train**. Un train complet à J-10 rouvre-t-il souvent à J-1 ? Calculé
   depuis l'historique, par numéro de train. Transforme un « complet » en « attends, celui-là revient
   dans 7 cas sur 10 ». Impossible sans archive : c'est la valeur unique du projet.
3. **Supprimé ≠ complet**. Un train qui disparaît du dataset n'est pas plein : il est supprimé
   (travaux, grève, changement de service). Distinguer les deux évite de croire à une saturation.
   Détection gratuite en comparant les clés entre deux snapshots.
4. **Score unique de mérite** = durée + créneau horaire + probabilité de rester disponible.
   Un tri par pertinence plutôt que trois filtres à régler.
5. **Raccourcis PWA** (`shortcuts` du manifeste) : « prochain aller » / « prochain retour »
   par appui long sur l'icône, en tenant compte de l'alternance de sens.

Cas limite, à connaître sans forcément l'implémenter : le dataset couvre **toutes** les OD, donc on
peut voir qu'un train complet en Paris → Bordeaux reste disponible en Paris → Toulouse. Réserver
plus loin pour descendre à Bordeaux occupe une place sur un parcours plus long ; c'est un usage
discutable, à ne pas mettre en avant dans l'interface.

### Notifications

Web Push, émis **par le collecteur**, reçu par la PWA installée. Le service worker ne se réveille
pas seul sur Android : il ne fait que recevoir un message poussé depuis l'Action. Pas de backend,
l'abonnement étant stocké dans le repo.

- La PWA vérifie au démarrage que son abonnement correspond à celui commité ; s'il a changé
  (rotation navigateur, réinstallation), elle le réécrit via le même PAT que `watchlist.json`.
- Si l'envoi renvoie 404/410, le workflow doit **échouer bruyamment** : GitHub envoie alors un mail
  d'échec, seul canal de secours quand le canal principal est mort.
- Afficher dans la PWA la date du dernier envoi réussi.

**Pas de notification à 17h02.** Les places libérées faute de confirmation ne sont publiées
dans le dataset que le lendemain matin. Une vérification à 17h02 relirait exactement le même
fichier que celle du matin. C'est une limite de la source, pas d'implémentation.

### Prévision « ça va partir vite ? » — statistique, pas LLM

Calculée dans le collecteur, à partir des snapshots accumulés :
pour chaque (jour de semaine, tranche horaire), durée médiane observée entre l'entrée d'une date
à J+30 et le passage du train à `NON`. Affichage : « les vendredis 19h partent en général en 4 jours
— basé sur 7 observations ». Toujours montrer la taille d'échantillon.

Signal exploitable à partir de ~8 semaines de collecte. Avant ça, afficher les données brutes sans
prévision plutôt qu'une estimation inventée.

Contexte calendaire (jours fériés, vacances scolaires, ponts) : `calendrier.api.gouv.fr` et le jeu
de données vacances scolaires de l'Éducation nationale. Exact, gratuit, déterministe.

Pas d'appel LLM dans la boucle de décision.

### Liens vers SNCF Connect

Aucun schéma de deep link public et à jour n'existe pour SNCF Connect (la documentation SNCF
sur les liens profonds concerne des applications obsolètes). Procédure :

1. Faire une recherche Paris → Bordeaux datée dans SNCF Connect sur le téléphone, récupérer l'URL produite.
2. La stocker comme gabarit dans `web/src/config/deeplink.ts`, avec les paramètres interpolés
   (origine, destination, date, heure).
3. Utiliser un lien `https://` classique : Android App Links ouvrira l'app si elle revendique le
   domaine, sinon le navigateur — dégradation acceptable dans les deux cas.
4. Considérer ce gabarit comme **cassable à tout moment**. Un seul fichier à corriger, et un lien
   de repli vers la page d'accueil si l'interpolation échoue.

## Design — direction artistique et interaction

Objectif : un instrument de données, pas une app de productivité générique. La référence n'est pas
un dashboard, c'est une app d'horaires — dense, typographique, silencieuse. Si la maquette pourrait
être celle de n'importe quel produit récent, elle est ratée.

### Ce qui est interdit

> **Révisé après essai sur téléphone.** Cette liste a été appliquée à la lettre, et le résultat
> a été jugé austère au point de paraître inachevé. Les interdits sur les dégradés, la profondeur
> et les arrondis sont levés : ils servent la prise en main, pas la décoration.
>
> Restent interdits, eux : l'accent violet, les emoji, les illustrations, l'écran d'accueil avec
> logo, l'onboarding, les skeletons scintillants, les toasts, la barre d'onglets à cinq icônes.
>
> Et surtout, la règle qui portait vraiment le produit tient toujours : **une seule couleur
> saturée**, l'échelle de disponibilité. La couleur n'encode jamais autre chose qu'une valeur ;
> la profondeur et les arrondis, eux, n'encodent rien du tout.

### Direction

- **Un seul écran.** Le calendrier est l'identité du produit et occupe l'essentiel. Tout le reste
  (détail d'un jour, réglages, quota) vit dans une *bottom sheet* glissante. Pas de navigation.
- **Une seule couleur saturée** : l'échelle de disponibilité. Tout le reste est neutre. La couleur
  n'est jamais décorative, elle encode toujours une valeur.
- **Chiffres tabulaires** (`font-variant-numeric: tabular-nums`). Une grille de nombres qui ne
  s'alignent pas verticalement trahit immédiatement l'amateurisme.
- **Contraste réel**, pas des pastels : l'app se consulte dehors, sur un quai, en plein soleil.
- **Mode sombre par défaut selon le système.** Usage nocturne fréquent, en train.
- Densité assumée : 30 cases lisibles d'un coup d'œil valent mieux qu'un défilement élégant.

### Gestuelle

Le geste est le mode d'interaction principal, le tap est le repli.

- **Glissement horizontal sur le calendrier** → changement de sens. Le sélecteur en haut suit le
  doigt en continu, il ne bascule pas d'un coup à la fin. C'est ce suivi 1:1 qui fait « natif ».
- **Bottom sheet à points d'ancrage** (fermée / demi / pleine), tirée verticalement, avec inertie
  et projection de la vélocité. Interruptible à tout instant.
- **Balayage sur une ligne de train** : vers la gauche « surveiller », vers la droite « j'ai réservé ».
  Révélation progressive de l'action sous le doigt, validation au franchissement du seuil.
- **Appui long sur un jour** → aperçu rapide sans ouvrir la sheet.
- **Retour haptique** (`navigator.vibrate(10)`) au franchissement de chaque seuil et à l'accrochage
  d'un ancrage. Uniquement là, jamais sur un tap simple.

Contrainte à traiter dès le début : sur Android, les bords latéraux sont captés par le geste de
retour système. Aucune interaction horizontale ne doit démarrer dans cette zone.
`overscroll-behavior: contain` pour neutraliser le pull-to-refresh de Chrome, qui entrerait en
conflit avec la sheet.

### Mouvement

- **Budget serré** : 150-200 ms pour les transitions d'état, `cubic-bezier(0.2, 0, 0, 1)`.
  Ressort uniquement pour la sheet et les gestes.
- **Rien ne s'anime à l'ouverture.** L'app s'ouvre plusieurs fois par jour ; une animation
  d'entrée est charmante la première semaine et insupportable la troisième.
- **Transform et opacity uniquement.** Aucune animation de propriété déclenchant un layout.
- View Transitions API pour les changements de vue, si le support est là ; dégradation silencieuse sinon.
- `prefers-reduced-motion` respecté : tout devient instantané, rien ne casse.

### Chargement

Il n'y a rien à charger : les données sont un JSON statique mis en cache par le service worker,
stratégie *cache first* puis revalidation en fond. L'app doit s'afficher pleine et lisible en moins
de 100 ms, hors ligne comprise. **Aucun spinner ne doit exister dans le code.** La seule information
d'état est la date de fraîcheur, et le bandeau d'alerte si elle dépasse 36 h.

### Le test

Ouvrir l'app, comprendre s'il faut réserver, refermer : moins de trois secondes, sans lire un mot.

## Phase 3 — Analyse (après ~3 semaines de collecte)

Courbe d'érosion moyenne J-30 → J-0 par jour de semaine. C'est la seule vue que personne d'autre n'a,
puisqu'elle demande un historique que la source ne conserve pas.

---

## Pièges connus

- **Cron GitHub Actions** : déclenchement souvent retardé, parfois sauté sous charge. D'où les deux exécutions quotidiennes plus l'idempotence.
- **Workflows planifiés désactivés après une longue inactivité du repo** : les commits du bot ne suffisent pas toujours à réinitialiser le compteur. Vérifier au bout de deux mois que la tâche tourne encore.
- **Boucle de workflow** : le push du bot ne doit pas redéclencher le collecteur (`paths-ignore: data/**` ou `[skip ci]`).
- **Fuseau** : les `date` du dataset sont des dates locales de voyage ; le cron est en UTC. Ne jamais convertir les dates de voyage.
- **Places libérées après 17h la veille** : elles n'apparaîtront que dans le snapshot du lendemain matin. Ne pas promettre d'alerte « dernière minute » : ce système ne peut pas la faire.
- **`latest.json` non compressé** dans le repo pour être lisible par la PWA sans décompression côté client ; garder les archives gzippées.
