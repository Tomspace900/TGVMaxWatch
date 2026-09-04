# TGVmax Paris ↔ Bordeaux — guide d'utilisation

## À quoi ça sert

L'abonnement MAX JEUNE donne des trajets gratuits, mais tous les trains ne sont
pas ouverts à ce tarif, et ça change tous les jours. La SNCF publie l'état du
jour et **efface celui de la veille** : personne ne peut savoir si un train
fermé rouvre souvent, ni à quel moment il se ferme.

Cette application regarde tous les jours, garde tout, et te prévient quand
quelque chose bouge sur Paris Montparnasse ↔ Bordeaux Saint-Jean.

**Un mot sur ce qui est compté.** Partout où tu vois un nombre, ce sont des
**trains ouverts au TGVmax**, jamais des sièges. La SNCF ne publie aucun stock
de places : pour chaque train elle dit seulement oui ou non. « 12 » sur une case
du calendrier veut donc dire « douze trains réservables ce jour-là », et pas
douze sièges.

Trois questions auxquelles elle répond, et que rien d'autre ne sait faire :

- **Est-ce qu'il reste des trains le 17 octobre ?** — le calendrier, d'un coup d'œil.
- **Est-ce que ça se ferme vite ?** — l'historique, jour après jour, train par train.
- **Est-ce que je dois réserver maintenant ?** — les alertes viennent te chercher.

---

## Ce que tu vois

### L'écran principal : le calendrier

Trente jours, une case par jour. **Plus la case est colorée, plus il y a de
trains ouverts.** Une case vide veut dire aucun train ce jour-là, dans le sens
affiché. Le petit `+3` ou `-2` en bas d'une case dit ce qui a bougé depuis la
veille.

Tout en haut, le sélecteur de sens — Paris → Bordeaux ou Bordeaux → Paris.
**Il reste en place quand tu fais défiler l'écran** : c'est le contexte de tout
ce qui est affiché en dessous, et le perdre obligeait à remonter.
**Glisse horizontalement sur le calendrier pour changer de sens**, le sélecteur
suit ton doigt.

L'application s'ouvre toute seule sur le sens que tu vas probablement chercher :
si ton dernier trajet enregistré descend à Bordeaux, elle s'ouvre sur le retour.

Juste sous la barre, le bandeau coloré porte le sens en grand, la date de
publication des données, et une motrice qui **pointe dans le sens du voyage**.

En bas de l'écran :

- **Surveillance** — ce que tu suis. En face de chaque créneau, la frise qui
  montre jour après jour si *ce train-là* était ouvert ou fermé — c'est ce
  qu'on veut savoir devant un train qu'on attend, bien plus que le nombre de
  trains qui circulent ce jour-là.
- **Réservations** — une voiture par créneau, pleine ou vide, sur les 6 que
  permet l'abonnement.
- **Érosion et prévisions** — apparaît seulement quand il y a assez de recul.

### L'écran d'un jour

En haut, une barre qui ne bouge pas : le retour au calendrier, la date, et
**deux flèches pour passer au jour précédent ou suivant** sans repasser par le
calendrier — c'est le geste qu'on fait vraiment quand un créneau ne convient
pas.

Ensuite le total : combien de trains sont ouverts, sur combien qui circulent,
une courbe de l'évolution, et — quand il y a assez d'historique — une phrase du
genre « ce créneau part en général vers J-18 », toujours avec le nombre
d'observations sur lequel elle repose.

Puis tous les trains de la journée, dans l'ordre des départs. Pour chacun :

- l'heure de départ, l'heure d'arrivée en dessous, le numéro de train ;
- **la durée du trajet, en couleur si elle dépasse 3 h** — sur cet axe les temps
  vont de 2 h 05 à 3 h 30 pour le même prix, et un omnibus reste réservable sans
  être un bon choix ;
- **une petite frise** qui montre jour après jour si ce train était ouvert ou
  fermé — c'est là qu'on voit un train qui vient de rouvrir ;
- un badge **suivi** ou **réservé** si tu l'as marqué ;
- un train fermé est barré et grisé.

### L'écran d'érosion

Une courbe par jour de la semaine : combien de trains restent ouverts en
moyenne selon la distance au départ. Elle n'apparaît qu'à partir du moment où l'archive couvre
une fenêtre complète, soit environ un mois de collecte.

---

## Ce que tu peux faire

### Les gestes sur une ligne de train

- **Glisse vers la gauche** → surveiller ce créneau. Tu seras prévenu quand il
  bouge. Refais le geste pour arrêter.
- **Glisse vers la droite** → « j'ai réservé ». Le créneau s'ajoute à ton quota
  et un rappel de confirmation se programme automatiquement.

Le téléphone vibre légèrement au franchissement du seuil : tant que tu ne l'as
pas senti, rien n'est validé.

### Dans les réglages

- **Voir et libérer tes réservations.** Marquer une réservation « confirmé »
  éteint son rappel. « Libérer » retire le créneau, « oublier » efface un
  voyage passé.
- **Voir et retirer ce que tu surveilles.**
- **Activer les notifications**, une seule fois.
- **Exporter tes données** pour changer de téléphone, et les restaurer.
- **Enregistrer ton jeton GitHub**, une seule fois. Il est vérifié avant d'être
  accepté, puis masqué : il faut demander à le modifier pour y toucher.
- **Voir la version de l'application**, la date du code qui tourne, et chercher
  une mise à jour.

---

## Quand tu es prévenu

Tu reçois **au plus une notification par collecte**, soit une par jour. Elle
regroupe tout ce qui s'est passé.

Trois raisons de te déranger :

1. **Une date rouvre.** Une journée qui n'avait plus un seul train en a de
   nouveau au moins cinq. C'est le moment où le choix est le plus large.
2. **Un créneau se vide.** Une journée a perdu au moins trois trains et il en
   reste trois ou moins. Autrement dit : ça part, et il faut décider maintenant.
3. **Un créneau que tu suis a bougé.**

Les deux premières partent toujours, même si tu ne surveilles rien.

**Deux autres alertes, qui viennent du téléphone et pas d'internet :**

- **Le rappel de confirmation**, à 10 h la veille d'un voyage enregistré. Une
  réservation MAX JEUNE non confirmée avant 17 h la veille est perdue. Le
  message ouvre directement la page de confirmation SNCF.
- **L'alerte de panne**, si aucune donnée nouvelle n'arrive pendant 40 h. C'est
  le seul moyen d'être prévenu que la collecte s'est arrêtée : une notification
  normale est envoyée *par* le système de collecte, qui ne peut évidemment pas
  annoncer sa propre panne.

---

## Quand c'est mis à jour

**Les données de trains : une fois par jour.** La SNCF publie vers 4 h du matin.
La collecte passe deux fois pour être sûre de ne rien manquer, et l'application
récupère la nouvelle version à chaque ouverture. Tire vers le bas pour forcer.

L'écran affiche toujours la date de publication et l'âge de la donnée. **Au-delà
de 36 h, un bandeau prévient que quelque chose ne tourne plus.**

**L'application elle-même : à chaque amélioration.** Elle vérifie toute seule au
lancement et télécharge en fond ; la nouveauté s'applique au **lancement
suivant**. Concrètement : ouvre, attends quelques secondes, ferme complètement,
rouvre. Les réglages te disent où tu en es.

Certains changements rares demandent une vraie réinstallation. Dans ce cas on te
le dira — ça n'arrive que si l'application a besoin d'une nouvelle capacité du
téléphone.

---

## Ce que l'application ne sait pas faire

Autant le dire franchement, ce sont des limites de la source, pas des oublis :

- **Pas d'alerte à la minute.** Les trains rouverts faute de confirmation après
  17 h n'apparaissent que dans la publication du lendemain matin. En revanche
  l'alerte à la journée près fonctionne très bien, et c'est même là qu'il y a le
  plus à gagner : la disponibilité remonte franchement dans la dernière semaine
  avant le départ.
- **Pas de vision au-delà de 30 jours.** La source ne publie pas plus loin.
- **Pas de réservation depuis l'application.** Elle t'amène à la bonne date,
  la réservation se fait chez SNCF.
- **Un seul trajet suivi**, Paris Montparnasse ↔ Bordeaux Saint-Jean.

---

## Où sont tes données

**Tes réservations restent sur ton téléphone.** Elles ne partent nulle part.
Elles disent quand tu n'es pas chez toi, et ça ne regarde personne — d'où
l'export manuel comme seule sortie.

Ce que tu surveilles, en revanche, est enregistré en ligne : c'est ce qui permet
au système de savoir quoi te signaler pendant que ton téléphone est éteint.

Les horaires et l'historique viennent des données publiques
[TGVmax](https://ressources.data.sncf.com/explore/dataset/tgvmax/) de SNCF
Voyageurs, sous licence ODbL.
