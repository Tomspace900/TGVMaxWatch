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

L'écran est rangé dans l'ordre où tu en as besoin.

**1. L'état des données**, en une ligne : de quand elles datent, et leur âge.
Si la collecte prend du retard, un bandeau le dit ; si elle ne répond plus du
tout, il le dit autrement — ce ne sont pas les mêmes situations.

**2. Une réservation à confirmer**, quand l'échéance approche. Voir plus bas.

**3. Le suivi — c'est le cœur, donc c'est en haut.** Tout ce que tu suis, en
entier, jamais tronqué. Chaque ligne porte :

- l'heure du train suivi, le nom de la période (**MATIN**, **SOIR**…) si tu
  suis un moment de la journée, **JOUR** si tu suis la journée entière, ou
  **RÈGLE** si c'est un créneau récurrent ;
- la date, et **à combien de jours du départ on est** — « complet » à J-20 et
  « complet » à J-2 ne se lisent pas pareil ;
- **le sens**, sur chaque ligne : la question « est-ce que ce bloc suit le
  sélecteur du haut ? » ne se pose plus, chaque ligne répond pour elle-même ;
- **l'état, en toutes lettres** : `ouvert · 4 j`, `complet · 2 j`,
  `vient de rouvrir`. Le nombre de jours dit sur combien d'observations l'état
  tient — sur une archive jeune, c'est exactement ce qu'il faut savoir.

Touche une ligne pour ouvrir le jour correspondant, ou **balaie-la** : vers la
gauche pour ne plus la suivre, vers la droite pour marquer ou démarquer une
réservation — exactement les mêmes gestes, sur exactement le même objet, que
dans la liste des trains d'un jour.

**Le bouton « + créneau régulier »** ouvre la seule chose qui ne pouvait pas se
faire depuis l'application : poser un suivi qui se répète. Tu choisis le
jour de la semaine, le sens, et le créneau — matin, midi, soir, ou toute la
journée — et l'alerte partira chaque semaine, sans rien redemander.

**4. Tes réservations**, quand tu en as. Une ligne par voyage à venir, avec le
sens et l'état de la confirmation. Balaie vers la droite pour retirer une
réservation annulée. Les voyages passés n'y sont plus affichés : ils ne
demandent plus rien. Ils restent dans l'appareil et dans l'export.

**Ce qui est parti disparaît tout seul.** Une heure après le départ d'un train
suivi, sa ligne s'en va : elle ne dit plus rien, et la liste s'allongerait
indéfiniment. Le fichier, lui, se nettoie à la prochaine modification.

**5. Le calendrier.** Trente jours, une case par jour. **Plus la case est
colorée, plus il y a de trains ouverts.** Une case grise veut dire aucun train
ce jour-là, dans le sens affiché. Deux nombres par case et pas un de plus : le
quantième, et le compte.

Ce compte est un nombre de **trains**, jamais de places : la SNCF ne publie pas
ses sièges, seulement si un train est ouvert au TGVmax. Et c'est un nombre de
**départs** — deux rames à la même minute comptent pour un. Les chiffres du
calendrier ont donc baissé d'environ un dixième le jour où ce changement est
arrivé ; il n'y a pas moins de trains qu'avant, ils ne sont plus comptés deux
fois.

Juste au-dessus, le sélecteur de sens — Paris → Bordeaux ou Bordeaux → Paris.
Il est là, et plus tout en haut de l'écran, parce qu'il ne gouverne que le
calendrier. **Glisse horizontalement sur la grille pour changer de sens**, le
sélecteur suit ton doigt.

**6. Érosion et prévisions** — apparaît seulement quand il y a assez de recul.

### L'écran d'un jour

En haut, une barre qui ne bouge pas : le retour au calendrier, la date, et
**deux flèches pour passer au jour précédent ou suivant** sans repasser par le
calendrier — c'est le geste qu'on fait vraiment quand un créneau ne convient
pas.

Une rangée **SUIVRE** pose un suivi d'un geste : toute la journée, ou seulement
le matin, le midi, l'après-midi ou le soir. **Les périodes se recouvrent d'une
heure** — un départ à 11 h 30 compte dans le matin comme dans le midi : avec des
bornes jointives, on manquerait le train cherché pour trente minutes sans jamais
comprendre pourquoi.

Ensuite le total : combien de trains sont ouverts, sur combien qui circulent,
une courbe de l'évolution, et — quand il y a assez d'historique — une phrase du
genre « ce créneau part en général vers J-18 », toujours avec le nombre
d'observations sur lequel elle repose.

Juste en dessous, une rangée **MASQUER** pour alléger la liste, construite
comme la précédente. Trois filtres, chacun avec son compte :

- **OUIGO** — actif par défaut. Ton abonnement ne les couvre pas : mesuré sur
  toute l'archive, aucune rame OUIGO n'a jamais été ouverte au TGVmax. C'est un
  bon septième de la liste que tu ne peux de toute façon pas prendre. La
  pastille reste affichée et comptée, pour que rien ne disparaisse en silence.
- **plus de 3 h** — un omnibus coûte le même prix qu'un direct et met une heure
  et demie de plus.
- **complets** — quand tu ne veux voir que ce qui est réservable.

Le total en haut, lui, continue de compter la journée entière.

Toute la liste est accrochée à **une voie** qui descend le long de l'écran,
chaque train relié par une traverse : la journée a la forme de ce qu'elle
décrit.

Puis tous les trains de la journée, dans l'ordre des départs.

**Un départ, une ligne.** La SNCF publie parfois deux rames pour le même train —
même minute, même arrivée, deux numéros — parce que ce sont deux matériels. Pour
toi c'est un seul train, et l'application le montre comme un seul : la liste
d'une journée est un quart plus courte, et il n'y a plus deux lignes identiques à
la suite qui se lisaient comme un bug. Quand une seule des deux rames est ouverte
au TGVmax, c'est **son numéro** qui s'affiche — celui qu'il faut saisir chez
SNCF.

Pour chaque départ :

- l'heure de départ, l'heure d'arrivée en dessous, le numéro de train ;
- **la durée du trajet** — sur cet axe les temps vont de 2 h 05 à 3 h 30 pour le
  même prix ; « 3h12 » à côté de « 2h05 » se lit tout seul, sans qu'on ait
  besoin de le peindre en rouge ;
- **une petite frise à droite** : les sept derniers jours de collecte, plein
  quand le train était ouvert au TGVmax. C'est là qu'on voit un train qui tient
  depuis une semaine et un train qui vient de rouvrir ;
- **un mot, quand l'archive a quelque chose à dire** : `VIENT DE ROUVRIR` ou
  `OUVERT · INSTABLE`. Rien le reste du temps — un train ouvert qui l'était
  déjà hier ne mérite pas qu'on l'écrive sur trente-cinq lignes ;
- **`LONG`**, en ambre, sur les trajets de plus de 3 h ;
- un badge **suivi** ou **réservé** si tu l'as marqué — « réservé » est en
  couleur, parce que c'est le seul des deux qui t'engage ;
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
- **Glisse vers la droite** → « j'ai réservé ». Le seul effet est d'armer le
  rappel de confirmation — c'est à ça que sert ce geste, et à rien d'autre.
  Refais-le sur un train déjà marqué pour le démarquer : le rappel s'éteint.

Le téléphone vibre légèrement au franchissement du seuil : tant que tu ne l'as
pas senti, rien n'est validé.

### Dans les réglages

Il n'y reste que ce qui se règle une fois. Tes réservations et ton suivi sont
sur l'accueil, là où tu es quand ils comptent.

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

**En tête, ce que tu suis.** Si un créneau que tu suis — « les jeudis matin » —
passe de rien à quelque chose, ou se vide alors qu'il n'en restait presque plus,
c'est la première ligne du message et c'est elle qui donne le titre :
« 17/09 Paris → Bordeaux matin : 3 trains ». Les horaires qui ont ouvert le
créneau ne sont pas répétés en dessous : tu as demandé à suivre un créneau, on
te prévient pour un créneau. Touche la notification pour voir lesquels.

Un créneau est vide la plupart du temps — 65 % à midi, 63 % le soir — donc
« il s'ouvre » se déclenche dès **un** train : ce qu'on veut savoir, c'est qu'il
devient possible.

Ensuite, trois raisons de te déranger même sans rien suivre :

1. **Une date rouvre.** Une journée qui n'avait plus un seul train en a de
   nouveau au moins cinq. C'est le moment où le choix est le plus large.
2. **Un créneau se vide.** Une journée a perdu au moins trois trains et il en
   reste trois ou moins. Autrement dit : ça part, et il faut décider maintenant.
3. **Un créneau que tu suis a bougé.**

Les deux premières partent toujours, même si tu ne suis rien.

**Trois canaux Android séparés** : les disponibilités, le rappel de
confirmation, et la panne de collecte. Tu peux en couper un dans les réglages
Android sans perdre les autres — couper le rappel ne doit pas te priver des
alertes.

**Deux autres alertes, qui viennent du téléphone et pas d'internet :**

- **Le rappel de confirmation**, à 10 h la veille d'un voyage enregistré. Une
  réservation MAX JEUNE non confirmée avant 17 h la veille est perdue. Le
  message ouvre directement la page de confirmation SNCF. **Dans les 48 h qui
  précèdent le départ** — c'est-à-dire dès que la confirmation devient
  possible, et pas avant — l'application la met aussi **en haut de l'écran
  d'accueil**, avec le temps restant et les deux gestes qui vont avec :
  « Confirmer » et « C'est fait ». La carte s'en va quand le train part. C'est
  le seul endroit où cette application peut te coûter de l'argent, elle ne doit
  pas te le dire discrètement.
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
