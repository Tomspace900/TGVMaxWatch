# TGVMaxWatch — note de reprise

Suivi quotidien des disponibilites TGVmax sur Paris Montparnasse <-> Bordeaux
Saint-Jean : archivage, alertes, application Android.

Ce document porte les **regles apprises a nos depens** et les pieges a ne pas
rejouer. Deux autres documents, a tenir a jour avec le code : `README.md` decrit
ce qui tourne et ce qu'on fait des donnees, `GUIDE.md` explique l'application a
son utilisateur, sans jargon.

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

`data/snapshots/` est la source de verite. `history.json`, `stats.json` et
`trains.json` en sont des vues **entierement recalculees a chaque execution** :
un bug d'agregation se repare en relancant le job.

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

**Ce projet compte des trains, jamais des places.** `od_happy_card = OUI` dit
qu'un *train* est ouvert au TGVmax ; la source ne publie aucun stock de sieges
et n'en publiera jamais. « places » etait pourtant ecrit partout — dans
l'application comme dans les notifications, ou « 57 places ouvertes » annoncait
57 trains. L'erreur passait inapercue sur le calendrier, ou le chiffre est nu,
et devenait absurde des qu'il touchait un horaire : « 8 places » en face du
07h12 se lisait comme huit sieges dans ce train-la. Le mot vit dans
`src/label.ts`, avec les autres lecteurs de la source — pas dans l'interface,
qu'on remplace.

**Deux familles de couleur, et elles ne se croisent jamais.** `avail` est la
seule echelle qui porte de l'information : plus il y a de trains ouverts, plus
la case est dense. `brand` est le degrade Carmillon de SNCF Voyageurs — violet,
framboise, vermillon — et il ne sert qu'a l'habillage : navbar, materiel
roulant, action principale, alerte. Melanger les deux rend l'echelle illisible,
l'oeil ne sachant plus si une case est coloree parce qu'elle est pleine ou parce
que c'est la couleur du produit. Le sens de la faute va dans les deux
directions : les creneaux de quota etaient peints en `avail[3]`, ce qui les
faisait lire comme une mesure de disponibilite alors qu'ils n'en sont pas une.

La charte TGV INOUI n'est pas publique et sa police, Achemine, est
proprietaire : ni l'une ni l'autre n'est utilisable ici. Les valeurs retenues
viennent de la palette publiee de SNCF Voyageurs, et les polices sont Archivo et
Share Tech Mono, sous licence SIL Open Font.

**Un degrade ne coute pas un APK, une police non plus — mais il faut le
verifier.** `react-native-svg` est deja embarque et sait faire un
`LinearGradient` : passer par `expo-linear-gradient` aurait demande un nouveau
build de ~108 Mo pour un fond. Meme raisonnement pour `expo-font`, qui est deja
dans le binaire parce qu'il est une dependance du paquet `expo` lui-meme. La
verification est `npx expo-updates fingerprint:generate --platform android`,
avant et apres : l'empreinte est restee identique en ajoutant les `.ttf` **et**
en declarant `expo-font` en dependance directe. Sans cette mesure, une
dependance ajoutee a l'aveugle change l'empreinte, et l'installation existante
cesse simplement de recevoir les mises a jour — en silence, comme toujours ici.

**Sur Android, `fontWeight` ne synthetise rien face a une famille embarquee.**
Demander du gras a « Archivo » rend du romain. Chaque graisse est donc une
famille nommee, et les styles passent par les presets de `typo` plutot que par
`fontWeight`. Corollaire : un `<Text>` sans `fontFamily` retombe sur Roboto, et
un seul oubli fait cohabiter deux polices sur le meme ecran.

**Une couleur qui signifie quatre choses ne signifie plus rien.** L'accent
Carmillon a porte en meme temps l'en-tete, le sens actif, la jauge de quota et
la duree des trains longs : a l'usage, l'oeil cesse de le traiter comme un
signal. Une seule dimension a desormais droit a la couleur porteuse de sens,
**la densite de trains ouverts**. Tout le reste se dit par le mot, la position
ou le barre — qui est, mesure sur les captures, le meilleur encodage de toute
l'application. L'accent ne sert plus qu'a l'identite et aux alertes systeme.

Corollaire mesure : peindre les trajets longs en couleur d'alerte mettait un
signal sur **une ligne utile sur quatre** — 14 % de toutes les rames depassent
3 h, mais 23 a 25 % des rames *ouvertes* selon le snapshot. Un signal present
partout est un fond. Le
besoin dit « ecarter », pas « signaler » : c'est un filtre, pas une couleur.

**Le delta est un capteur, pas un affichage.** La variation d'un jour a l'autre
etait peinte dans chaque case — un troisieme nombre dans une surface qui n'en
supporte pas trois, et sur certaines cases seulement, ce qui forcait l'oeil a
chercher pourquoi. Personne ne lit l'ecart d'hier a aujourd'hui : ce qu'on veut
savoir, c'est ou en est *son* creneau et quelle est la tendance longue. La
variation reste ce qu'elle a toujours ete utilement, le declencheur des deux
alertes generales dans `src/diff.ts`.

**Une troncature silencieuse est une information qui disparait.** La carte de
surveillance affichait quatre entrees sous un compteur qui annoncait le total,
sans rien dire de ce qui manquait ni comment y acceder — sur la carte qui porte
le coeur du produit. Rien ne doit disparaitre sans le dire : ni une liste
coupee, ni une notification ecartee par le budget.

**Ce qui coute de l'argent vit la ou on est quand ca compte.** Une reservation
MAX JEUNE non confirmee avant 17h la veille est perdue, et c'est le seul endroit
ou cette application peut couter quelque chose de reel. L'echeance n'existait
que dans une alarme locale et dans l'ecran de reglages — c'est-a-dire nulle part
au moment ou elle decide. Elle est en tete de l'accueil dans les 72 h qui la
precedent, et **seulement** dans ces 72 h : une carte permanente pendant les
trois semaines qui separent la reservation du voyage n'est pas un avertissement,
c'est du decor.

**Une illustration qui coute la premiere moitie d'un ecran doit porter une
information.** Le bandeau d'accueil repetait le sens deja affiche par le
selecteur juste au-dessus et poussait sous la ligne de flottaison la carte qui
porte le coeur du produit. La motrice et les voitures sont parties avec.

**L'ordre vertical de l'accueil est une decision produit, pas une mise en
page.** La surveillance repond a la question de la session de trente secondes —
« mon creneau, ou en est-il ? » — et se trouvait apres trente cases de
calendrier, dans une carte de quatre lignes. Le calendrier sert a *trouver* une
date : c'est ce qui vient ensuite dans l'ordre du besoin, pas avant.

**Un controle epingle doit gouverner ce qu'il surplombe.** Le selecteur de sens
etait fixe en haut ; une fois la surveillance passee au-dessus du calendrier, il
dominait un bloc qu'il ne filtre pas. Il est redescendu contre sa grille — et il
n'y avait rien a y gagner, cinq rangees restant visibles tout le temps qu'on les
regarde. La barre fixe garde son sens sur l'ecran d'un jour, ou la liste fait
trente-cinq lignes.

**Un encodage qui demande une legende permanente n'est pas un encodage.** La
frise de trente cellules par train coutait une phrase d'explication sous la
carte et pres de mille vues sur un ecran de journee, pour dire la plupart du
temps « ouvert, comme hier ». Le besoin porte sur la **confiance**, pas sur la
visualisation de trente etats : `src/trace.ts` en tire un mot, et la duree qu'il
porte *est* sa taille d'echantillon. Le mot ne sort dans une liste que sur les
deux cas qui decident — vient de rouvrir, instable — parce qu'un signal present
sur la majorite des lignes est un fond.

**Un rappel avant que l'action soit possible n'est pas un rappel.** La
confirmation n'ouvre que 48 h avant le depart : la carte se borne donc sur le
**depart**, pas sur l'echeance, et se referme quand le train est parti.

**Un geste qui marche a un endroit et pas a l'autre est un geste qu'on cesse
d'essayer.** Le balayage vivait dans la ligne de train ; la surveillance le
voulait aussi, avec les memes seuils et les memes retours haptiques. Deux
implementations du meme geste deviennent deux gestes des que l'une derive de dix
pixels — `SwipeRow` est desormais le seul endroit ou il est ecrit. Un cote sans
action garde un debattement mais ne s'arme pas : la ligne ne promet rien qui
n'arrivera pas.

Corollaire : **le meme geste demande le meme objet**. Les lignes de surveillance
etaient plates et separees par un filet, la ou une ligne de train est une carte
posee ; le meme balayage y revelait un degrade sur toute la largeur, sans coin
ni marge. Le geste etait identique, la forme non, et ca se voyait.

**Un geste qui ne sait pas se defaire la ou il se fait est un formulaire.** Le
balayage « j'ai reserve » n'etait qu'un ajout : rebalayer le meme train
l'enregistrait une seconde fois, et seul l'ecran de reglages savait defaire.
`toggleBooking` retire toujours avant d'ajouter — l'ecriture est donc idempotente
par construction, et non conditionnee a un etat lu depuis le rendu precedent.

**Ce qui est passe cesse d'exister.** Une entree de surveillance dont le train
est parti depuis plus d'une heure n'est plus affichee, et disparait du fichier a
la prochaine ecriture — jamais parce qu'un ecran s'est affiche : on n'ecrit pas
dans le depot pour un rendu. La comparaison se fait sur des chaines, l'appelant
fournissant l'horloge deja reculee de sa grace : une date de voyage ne se
convertit pas, meme pour savoir si elle est passee.

**Trois ecrans modifient la surveillance, un seul l'ecrit.** `setWatchlist`
prend une fonction — meme raison que `setReservations` — et la persistance est
un effet du changement d'etat, dans le fournisseur. Un marqueur distingue une
edition locale d'un rafraichissement, sans quoi l'effet renverrait au depot ce
qu'il vient d'en lire.

**Un geste sans affordance sera oublie entre deux vagues d'usage.** Cette
application s'ouvre beaucoup pendant une semaine puis plus rien pendant quinze
jours : un balayage peut etre un raccourci, jamais l'unique chemin vers une
fonction de premiere importance. Poser une surveillance a donc un bouton, et le
creneau recurrent — dont le format et le moteur existaient depuis le debut mais
qui ne pouvait s'ecrire qu'a la main dans le depot — a enfin un ecran.

**Les reglages ne gerent rien.** Ils portaient la liste des reservations et
celle des surveillances, avec leurs boutons : l'ecran le moins frequente charge
des gestes qui comptent au moment ou l'on est ailleurs. Les deux vivent sur
l'accueil, avec le meme balayage que partout. Attention en deplacant une
section : l'avertissement de panne du stockage local vivait dans celle des
reservations, et il est parti avec — c'est le seul endroit ou la donnee n'est
pas reconstituable depuis l'archive, il ne peut pas rester muet. Il est
desormais la ou l'ecriture se fait.

**Un voyage passe se masque, il ne s'efface pas.** Il ne demande plus rien et
n'a donc plus a etre affiche, mais il reste dans le stockage et dans l'export :
effacer une donnee utilisateur en silence est exactement ce qui a deja coute une
reservation a ce projet.

**Les periodes de la journee se recouvrent d'une heure, et c'est le point.** Un
depart a 11h30 est autant une fin de matinee qu'un debut de midi : avec des
bornes jointives, quelqu'un qui suit « le matin » manque ce train pour trente
minutes sans jamais comprendre pourquoi. Le recouvrement coute quelques trains
suivis en trop, la coupure nette coute celui qu'on cherchait. La table vit dans
`src/periods.ts` parce que deux ecrans la lisent — le formulaire recurrent et
les raccourcis d'une journee — et que deux tables divergeant d'une heure seraient
indiagnosticables depuis l'ecran.

**Le verdict ne remplace pas entierement la frise.** Retirer les trente cellules
etait juste ; ne plus rien montrer sur les lignes « stables » l'etait moins,
puisque la ligne cessait de dire quoi que ce soit de son passe. Sept jours
suffisent a repondre a « est-ce que ca tient ? » et coutent sept fois moins que
trente. Le mot reste pour les deux cas qui decident.

**Le titre d'un bloc doit dire le mot du geste qui le remplit.** Le bloc
s'appelait « Surveillance », le geste disait « suivre » et le badge « suivi » :
l'application parlait deux langues sur le meme objet.

**Trois familles de couleur, etanches, et une regle qui les separe.** `avail`
est une **echelle** — elle se compare, plus dense veut dire plus, et elle ne
vit que dans le calendrier et la frise. `brand` designe **ce qui t'engage** :
reservation, echeance, panne. `amber` est **l'avertissement** : ce train est un
mauvais choix par defaut. Une echelle et une categorie ne peuvent pas se
confondre parce qu'elles ne cohabitent jamais au meme endroit — c'est ce qui
permet d'ouvrir la palette sans rejouer l'accent qui signifiait quatre choses.

L'ambre ne sert aujourd'hui qu'aux trajets de plus de trois heures. Tout autre
usage doit passer le meme test : **une categorie, jamais une mesure**, et
toujours doublee d'un mot. C'est le doublage qui la rend sure — vert et ambre se
ressemblent en deuteranopie, la pastille dit le mot, la couleur ne fait que
l'accelerer. Deux candidats ont deja ete ecartes : la donnee perimee, qui est
Carmillon parce qu'elle t'engage, et un creneau qui se vide, qui est une mesure.

**OUIGO n'est jamais eligible au TGVmax.** Mesure sur l'archive complete : 1 916
rames OUIGO, **zero** ouverte. C'est structurel, MAX JEUNE ne couvre pas OUIGO.
Consequence de design, contre-intuitive : colorer ces lignes par transporteur
n'aurait peint que des lignes barrees — un septieme de la liste qu'on ne peut de
toute facon pas prendre. Ce ne sont pas des lignes a distinguer, ce sont des
lignes a **ecarter**, comme les trajets longs. Elles restent visibles par
defaut : masquer d'office ferait disparaitre des trains sans que personne ne
l'ait demande.

**Les paliers de duree sont a 2h20 et 3h00 parce que la grille horaire les y
met.** Histogramme des rames ouvertes : 240 sous 2h20, puis **9** entre 2h20 et
2h29, puis la distribution reprend a 2h30. Le seuil tombe pile dans le creux ;
le deplacer a 2h30 n'attraperait que ces neuf-la et casserait une frontiere que
la donnee dessine elle-meme. Trois familles reelles : le direct, l'arret en
plus, l'omnibus.

**La motrice porte la vitesse, jamais le transporteur.** Nez a droite, barres de
vitesse a gauche : c'est le sens de lecture, et la rame entre ainsi dans les
donnees de sa ligne. Trois barres pour un direct, une pour un arret de plus,
aucune et la couleur d'avertissement au-dela de trois heures. C'est une
substitution et non un ajout — le glyphe remplace une pastille de duree qui
prenait la meme largeur en toutes lettres.

**La voie est la structure de la liste, pas un ornement.** L'espacement entre
deux cartes est un `paddingBottom` du conteneur et non une marge de la carte :
sans quoi la voie se coupe a chaque rangee. Elle reste hors du `SwipeRow` — du
decor fixe, c'est la carte seule qui se deplace sous le doigt.

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

**Deplacer un stockage, c'est ecrire la migration dans le meme commit.** Les
reservations sont passees du depot au stockage local de l'application sans
qu'aucun code ne transporte l'existant : a l'arrivee de la mise a jour, l'app a
cesse de lire `reservations.json` et s'est mise a lire une cle vide. Le creneau
enregistre a disparu, et le fichier ayant ete supprime dans le meme commit,
l'application ne pouvait meme plus le retrouver.

**Une lecture qui echoue n'est pas une liste vide.** Le meme code rendait une
liste vide dans les deux cas. Une lecture en erreur affichait donc « aucun
creneau », et la premiere ecriture suivante ecrasait definitivement le stockage
par cette liste vide augmentee d'un element. `readReservations` distingue
desormais les deux, et l'application **refuse d'ecrire** tant que la lecture n'a
pas reussi — c'est le seul endroit du projet ou la donnee n'est pas
reconstituable depuis l'archive.

**Une ecriture d'etat local se declenche sur le changement d'etat, pas dans le
gestionnaire du geste.** Ecrire dans le gestionnaire, c'est ecrire une valeur
calculee depuis le rendu precedent : deux gestes rapproches et le second efface
le premier. `setReservations` prend une fonction, jamais une valeur.

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
npm test              # 99 tests sur fixtures, aucun acces reseau
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

**On travaille directement sur `main`, et seulement sur `main`.** Pas de
branche de fonctionnalite, pas de pull request, pas de revue. Le proprietaire
de ce depot n'ouvre jamais l'editeur : tout est demande depuis un telephone, et
c'est l'assistant qui ecrit, verifie, commite et pousse. Les commits s'empilent
sur `main`, et le push livre dans la foulee — OTA pour le JS, collecte au cron
suivant. Une PR n'aurait personne pour la relire ; elle ne serait qu'une
ceremonie de plus.

**En echange, la verification n'est pas negociable, et elle passe avant le
push.** C'est la seule chose qui protege quoi que ce soit ici, et il faut voir
pourquoi elle n'est pas symetrique :

- L'application est couverte toute seule. `update.yml` fait tourner son propre
  `verify` — typecheck et tests — **avant** de publier : du JS casse ne peut
  pas atteindre le telephone.
- **Le collecteur ne l'est pas.** `collect.yml` part au cron sans rien
  demander a personne, et `ci.yml` tourne en parallele du push sans pouvoir
  l'arreter. Un collecteur casse sur `main` fait une journee manquee, et une
  journee manquee est perdue pour toujours — c'est l'invariant de ce projet.

D'ou la sequence, dans cet ordre, systematiquement :

```sh
npm test && npm run typecheck
cd mobile && npx tsc --noEmit && npx expo export --platform android --output-dir /tmp/export
```

Puis seulement le commit et le push. « Pas de securite » vaut pour le
processus, jamais pour l'archive.

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

**Statistiques.** Chaque metrique est publiee des qu'elle a un echantillon,
plus toutes ensemble derriere un compteur de snapshots : l'erosion demande une
arche complete J+30 -> J-0, soit environ un mois ; le taux de reouverture
demande cinq fermetures observees sur un meme train ; seules les medianes de
fonte ont besoin du long terme. La regle de fond ne bouge pas — jamais
d'estimation inventee, et toujours la taille d'echantillon a cote du chiffre.
L'archive a demarre le 2026-09-01.

**L'unite de compte doit passer de la rame au depart.** Decision prise, pas
encore appliquee. Le dataset publie les deux rames d'un meme depart comme deux
lignes : mesure sur `data/latest.json`, 2 141 lignes se replient en 1 585
departs (**-26 %**), et 338 rames ouvertes en 304 departs ouverts (**-10 %**).
556 departs sur 1 585 portent deux rames, dont **67 divergent** — l'une ouverte,
l'autre complete.

Le piege est que `history.json`, les seuils d'alerte et les courbes d'erosion
comptent tous des rames. Changer le seul affichage ferait dire « 5 trains » a la
notification et en montrerait 4 a l'ecran, en permanence et en silence. Le
changement doit donc traverser le collecteur, l'archive, les seuils et
l'interface **dans le meme commit**, ou ne pas se faire. A noter aussi : le
suivi se propage deja aux deux rames, parce qu'une entree de watchlist designe
une minute et non un train ; la reservation, indexee sur le numero, ne se
propage pas.

**Le silence est le mode de panne du projet.** Un workflow qui ne se declenche
pas n'envoie pas de mail d'echec, et une collecte manquee ne se voit nulle part
ailleurs. Une notification push n'y peut rien : elle est envoyee *par* le
collecteur, et un collecteur mort ne peut pas annoncer sa propre mort.

L'appareil, lui, le peut. `scheduleStaleAlarm` repose a chaque rafraichissement
reussi une alarme locale a 40h : tant que la donnee arrive, l'echeance recule.
C'est le seul dispositif qui survive a la panne qu'il surveille, et il ne
demande aucun service tiers. Reste vraie la contrainte de fond : les workflows
planifies sont desactives apres une longue inactivite du depot — verifier vers
le 2026-11-01 que `collect` tourne toujours.

## Source et licence

Donnees [TGVmax](https://ressources.data.sncf.com/explore/dataset/tgvmax/),
SNCF Voyageurs, licence **ODbL**. La mention doit rester visible dans
l'application.
