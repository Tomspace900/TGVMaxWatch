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

- le créneau tel que tu l'as posé — `jeu 24/09 18h → ven 25/09 11h` — ou
  l'heure du train si tu suis un train seul ;
- **à combien de jours du départ on est** — « complet » à J-20 et « complet » à
  J-2 ne se lisent pas pareil ;
- **le sens**, sur chaque ligne : la question « est-ce que ce bloc suit le
  sélecteur du haut ? » ne se pose plus, chaque ligne répond pour elle-même ;
- **l'état, en toutes lettres** : pour un créneau, combien de trains y sont
  ouverts (`3 trains ouverts`) ; pour un train, `ouvert · 4 j`, `complet · 2 j`,
  `vient de rouvrir` — le nombre de jours dit sur combien d'observations l'état
  tient.

Touche une ligne pour ouvrir le jour correspondant, ou **balaie-la** : vers la
gauche pour ne plus la suivre, vers la droite pour marquer ou démarquer une
réservation — exactement les mêmes gestes, sur exactement le même objet, que
dans la liste des trains d'un jour.

**Tout retrait se défait.** Quand tu enlèves un suivi ou une réservation, une
barre apparaît en bas et **nomme ce qui vient de partir** — « jeu 24/09 18h →
ven 25/09 11h n'est plus suivi » — avec un bouton *annuler*. Elle reste six secondes. Pas de
fenêtre de confirmation : le balayage doit rester un geste, pas un formulaire.
Et c'est le même comportement sur l'écran d'un jour.

**Le bouton « + créneau »** pose ce que tu cherches vraiment : « je rentre entre
jeudi 18h et vendredi 11h ». Tu choisis le sens, puis **les jours sur un
calendrier** — le même que celui de l'accueil, avec ses comptes : touche jeudi,
puis vendredi pour prolonger la fenêtre jusqu'à lui. En dessous, l'heure de
début et l'heure de fin ; chacune dit à quel jour elle s'applique. Le bouton du
bas écrit le créneau en entier avant que tu le valides. Les trajets de plus de
3 h comptent par défaut, parce que ce sont des solutions ; un choix les écarte.
Le même bouton existe sur l'écran de chaque jour, et part de ce jour et de ce
sens — toucher le lendemain prolonge alors directement.

Un créneau s'efface tout seul une heure après sa fin. Il n'y a plus de créneau
qui se répète chaque semaine : il en couvrait cinq pour t'en désigner un.

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

Un **anneau** autour d'une case marque ce que tu y as posé : **plein** pour un
train réservé, **en pointillés** pour un créneau suivi. Une fenêtre qui passe
la nuit marque ses deux jours. Chaque sens a ses propres marques.

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

**6. Érosion et prévisions.** La carte est toujours là. Tant que l'archive est
trop jeune, elle dit **ce qui manque et dans quelle unité** — « 9 collectes sur
25 » — plutôt que de disparaître : une section absente ne t'apprend rien, et
elle cachait au passage le seul écran capable de l'expliquer.

### L'écran d'un jour

En haut, une barre qui ne bouge pas : le retour au calendrier, la date, et
**deux flèches pour passer au jour précédent ou suivant** sans repasser par le
calendrier — c'est le geste qu'on fait vraiment quand un créneau ne convient
pas.

Le bouton **+ suivre un créneau** ouvre l'éditeur sur ce jour et ce sens. Pour
suivre un train précis — un omnibus que tu es prêt à prendre, par exemple —
balaie sa ligne vers la gauche.

Ensuite l'encart du jour : **deux nombres et une forme**. À gauche « 1/29 » —
combien de trains sont ouverts, sur combien qui circulent. À droite, la courbe,
qui occupe tout le reste : c'est la seule chose de cette carte que la source ne
sait pas produire.

La courbe porte **deux graduations, le maximum et le zéro**, et le zéro est un
trait. C'est ce qui la rend lisible : « ça baisse » ne décide rien tant qu'on ne
sait pas si c'est de vingt à dix-huit ou de cinq à un, et une courbe qui touche
le trait du bas dit « plus aucun train » d'un coup d'œil. Sur une date qui vient
d'entrer dans la fenêtre, il n'y a qu'une observation : pas de courbe, et le
compteur reste seul.

En dessous, quand il y a assez d'historique, une phrase du genre « ce créneau
part en général vers J-18 », toujours avec le nombre d'observations sur lequel
elle repose.

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
moyenne selon la distance au départ.

Une courbe demande l'**arche entière** d'une date de voyage, de J+30 à son
départ — donc 25 collectes. Tant qu'elles ne sont pas là, l'écran dit combien il
en manque plutôt que de rester vide, et rien n'est tracé en attendant : des
données brutes valent mieux qu'une estimation inventée sur trois observations.
Une journée de collecte manquée repousse l'échéance d'autant, c'est pourquoi le
compte annoncé est un « au plus tôt ».

---

## Ce que tu peux faire

### Les gestes sur une ligne de train

- **Glisse vers la gauche** → surveiller ce créneau. Tu seras prévenu quand il
  bouge. Refais le geste pour arrêter.
- **Glisse vers la droite** → « réserver ». Le geste fait deux choses d'un seul
  mouvement : il **ouvre SNCF Connect** pour que tu y fasses la réservation, et
  il arme le **rappel de confirmation** ici. Refais-le sur un train déjà marqué
  pour le démarquer : le rappel s'éteint, et rien ne s'ouvre — on ne te sort pas
  de l'application pour t'annoncer que tu viens d'annuler.

  Le train est marqué **avant** que SNCF Connect s'ouvre, et il le reste même si
  tu ne réserves finalement pas. C'est volontaire : une réservation marquée pour
  rien se voit sur l'accueil et s'enlève d'un balayage, alors qu'un rappel jamais
  armé ne se voit nulle part — et c'est lui qui coûte de l'argent.

Le téléphone vibre légèrement au franchissement du seuil : tant que tu ne l'as
pas senti, rien n'est validé.

### Dans les réglages

Il n'y reste que ce qui se règle une fois. Tes réservations et ton suivi sont
sur l'accueil, là où tu es quand ils comptent.

- **Activer les notifications**, une seule fois.
- **Exporter tes données** pour changer de téléphone, et les restaurer.
- **Enregistrer ton jeton GitHub**, une seule fois. Il sert seulement à dire au
  collecteur quel téléphone réveiller. Il est vérifié avant d'être accepté, puis
  masqué.
- **Voir la version de l'application**, la date du code qui tourne, et chercher
  une mise à jour.

---

## Quand tu es prévenu

Tu reçois **au plus une notification par jour**, vers 6 h 30, juste après la
publication de la SNCF. Le plus souvent elle n'a qu'une ou deux lignes, et
souvent rien du tout. C'est ton téléphone qui décide : lui seul sait ce que tu
suis, rien ne quitte l'appareil.

Il compare avec **la dernière donnée qu'il a vue**, pas avec celle de la veille :
si un jour ton téléphone ne se réveille pas, le message du lendemain raconte les
deux jours. Tant que tu ne fais pas « Forcer l'arrêt » sur l'application dans les
réglages Android, pas besoin de la laisser ouverte, ni de la rouvrir après un
redémarrage.

**Le titre nomme ce que tu suis, toujours** : « jeu 24/09 18h → ven 25/09 11h :
1 → 7 trains ». Juste en dessous, le sens. Pour un train suivi seul : « lun 28/09
19:11 : ouvert » ou « complet ».

Un créneau que tu suis donne une ligne dès qu'il bouge pour de bon :

- **il s'ouvre** — il n'y avait rien, il y a au moins un train ;
- **il se remplit** — il en restait trois ou moins, il en arrive au moins deux ;
- **il se vide** — il en reste deux ou moins, même s'il n'en a perdu qu'un ;
- **il se ferme** — il n'en reste plus aucun, va voir un autre jour.

Ensuite, deux raisons de te déranger même sans rien suivre, qui ne passent
jamais devant ce que tu suis, et seulement pour des voyages dans les **deux
semaines** — au-delà, une date qui se remplit n'est que la mécanique de la
fenêtre de trente jours :

1. **Une date rouvre.** Une journée qui n'avait plus un seul train en a de
   nouveau au moins cinq.
2. **Une date se vide.** Une journée a perdu au moins trois trains et il en
   reste trois ou moins.

**Ce que l'application ne te dira pas.** Un créneau qui ne bouge pas ne produit
rien : s'il garde deux trains ouverts pendant trois semaines, tu ne recevras
aucun message à son sujet. L'application signale ce qui **change** ; l'état,
c'est l'accueil qui le montre.

**Trois canaux Android séparés** : les disponibilités, le rappel de
confirmation, et la panne de collecte. Tu peux en couper un dans les réglages
Android sans perdre les autres — couper le rappel ne doit pas te priver des
alertes.

**Deux autres alertes, qui viennent du téléphone et pas d'internet :**

- **Le rappel de confirmation.** Une réservation MAX JEUNE non confirmée avant
  17 h la veille est perdue, et la confirmation n'ouvre que 48 h avant le départ :
  tu as donc deux soirées et une journée pour le faire, et ce sont elles que les
  rappels couvrent. **Le premier part dès que la fenêtre ouvre**, l'avant-veille
  au soir : c'est celui qui te débarrasse du sujet, puisque dire « c'est fait »
  éteint tous les suivants — un voyage enregistré à l'avance ne te coûte alors
  qu'un seul message. Pour un train du soir, il attend l'ouverture réelle des
  48 h plutôt que de te demander un geste encore impossible. Puis il y en a un
  **à 10 h** la veille, et **un dernier à 15 h** si tu n'as toujours rien dit —
  une notification lue à 10 h dans un couloir n'existe plus à 16 h. Si tu
  enregistres une réservation la veille après 15 h, un rappel unique part un
  quart d'heure avant l'échéance plutôt que rien du tout. Le message ouvre
  directement la page de confirmation SNCF.
  **Dans les 48 h qui
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

**Les données de trains : une fois par jour.** La SNCF publie vers 6 h 25, et la
collecte part dans les cinq minutes. Le téléphone est réveillé juste après : s'il
y a quelque chose à dire, tu le sais avant 6 h 30. L'application récupère aussi
la nouvelle version à chaque ouverture. Tire vers le bas pour forcer.

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
- **Pas de réservation depuis l'application.** Elle t'amène à la bonne date et
  le balayage t'ouvre SNCF Connect, mais la réservation se fait là-bas. Le lien
  ouvre l'accueil de SNCF Connect, sans y reporter la date ni le trajet : SNCF
  ne publie aucun format de lien qui le permette, et en inventer un donnerait
  une page d'erreur le jour où il changerait.
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
