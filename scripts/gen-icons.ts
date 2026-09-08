/**
 * Genere les icones de l'application.
 *
 * Le motif est une colonne de creneaux dont un est ouvert — l'unite de
 * raisonnement reelle du produit, « les vendredis soir », et l'evenement qui le
 * justifie. Il remplace la grille 4x4 peinte avec l'echelle de disponibilite,
 * qui commettait sur l'icone la faute que le projet s'interdit partout
 * ailleurs : `avail` est la seule famille porteuse d'information, elle ne sert
 * jamais de decoration. Une icone est de l'habillage, donc du Carmillon.
 *
 * Deux proprietes valent d'etre tenues :
 *
 * - **le sens tient dans la geometrie, pas dans la couleur.** Le creneau ouvert
 *   est plus large et plus haut que les trois autres. C'est ce qui le sauve en
 *   silhouette monochrome, la ou l'ancienne grille rendait un pave uniforme :
 *   `foreground` et `monochrome` etaient le meme fichier au bit pres, toutes
 *   cases opaques, et la densite — c'est-a-dire toute l'idee — disparaissait ;
 * - **les bords sont anti-crenelees analytiquement.** Une distance signee au
 *   rectangle arrondi donne la couverture exacte de chaque pixel, la ou un test
 *   binaire laissait des escaliers sur les coins.
 *
 * Aucune dependance graphique : le PNG est encode a la main avec `node:zlib`.
 *
 *   node scripts/gen-icons.ts
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

/** Le fond sombre du chrome de l'application, et de `adaptiveIcon`. */
const GROUND: Rgb = [14, 16, 18];

/** Un creneau ferme : du blanc a 15 % pose sur le fond, aplati une fois. */
const CLOSED: Rgb = [50, 52, 54];

/** Le degrade Carmillon de SNCF Voyageurs, du framboise au vermillon. */
const CARMILLON: Rgb[] = [
  [176, 22, 120],
  [194, 23, 88],
  [218, 29, 51],
  [235, 25, 37],
];

/** La silhouette monochrome est lue en alpha, mais Android tinte du blanc. */
const MONO: Rgb = [255, 255, 255];

interface Slot {
  /** Coordonnees du dessin, de 0 a 100, quelle que soit la taille rendue. */
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
}

/**
 * Quatre creneaux au pas regulier de 15, centres sur 50.
 *
 * Le creneau ouvert est le deuxieme : place en tete, il se lirait comme un
 * titre ; place en dernier, comme un total. Au deuxieme rang, il est un element
 * de la serie qui se distingue — ce qu'il est.
 *
 * L'ensemble tient entre 21,5 et 76,5, soit 55 % du dessin : la zone sure
 * d'Android ne garantit que les 66 % centraux, et une icone adaptative doit y
 * tenir quel que soit le masque du lanceur.
 */
const SLOTS: Slot[] = [
  { x: 34, y: 23.5, w: 32, h: 8, open: false },
  { x: 25, y: 36.5, w: 50, h: 12, open: true },
  { x: 34, y: 53.5, w: 32, h: 8, open: false },
  { x: 34, y: 68.5, w: 32, h: 8, open: false },
];

function crc32(data: Buffer): number {
  let crc = 0xffff_ffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb8_8320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);

  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));

  return Buffer.concat([length, typed, crc]);
}

/**
 * Encode une image en PNG sans perte.
 *
 * L'alpha n'est pas un agrement : l'icone adaptative Android superpose un
 * premier plan a un fond, et un premier plan opaque masquerait ce fond. Il
 * porte desormais une valeur continue et non plus un booleen — c'est lui qui
 * transporte l'anti-crenelage des bords arrondis.
 */
function encodePng(size: number, pixel: (x: number, y: number) => Rgba): Buffer {
  // Une ligne = un octet de filtre (0 = aucun) suivi des quadruplets RGBA.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;

  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profondeur
  header[9] = 6; // truecolor + alpha
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Le degrade echantillonne, `t` allant de 0 a 1 le long du creneau. */
function ramp(t: number): Rgb {
  const clamped = Math.min(1, Math.max(0, t)) * (CARMILLON.length - 1);
  const index = Math.min(CARMILLON.length - 2, Math.floor(clamped));
  const mix = clamped - index;
  const from = CARMILLON[index]!;
  const to = CARMILLON[index + 1]!;
  return [
    Math.round(from[0] + (to[0] - from[0]) * mix),
    Math.round(from[1] + (to[1] - from[1]) * mix),
    Math.round(from[2] + (to[2] - from[2]) * mix),
  ];
}

interface DrawOptions {
  /** Part du cote occupee par le carre de dessin. Au-dela de 1, le motif deborde. */
  scale: number;
  /** Fond opaque, ou transparent pour un premier plan adaptatif. */
  background: Rgb | null;
  /** Silhouette d'une seule couleur, pour les icones themees d'Android 13+. */
  mono?: boolean;
}

function draw(size: number, { scale, background, mono = false }: DrawOptions): Buffer {
  const box = size * scale;
  const origin = (size - box) / 2;
  const unit = box / 100;

  // Geometrie precalculee en pixels : la boucle qui suit tourne un million de
  // fois, elle n'a pas a refaire ces multiplications.
  const shapes = SLOTS.map((slot) => {
    const radius = (slot.h / 2) * unit;
    return {
      centerX: origin + (slot.x + slot.w / 2) * unit,
      centerY: origin + (slot.y + slot.h / 2) * unit,
      insetX: (slot.w / 2) * unit - radius,
      insetY: (slot.h / 2) * unit - radius,
      radius,
      left: origin + slot.x * unit,
      width: slot.w * unit,
      open: slot.open,
    };
  });

  const empty: Rgba = background ? [...background, 255] : [0, 0, 0, 0];

  return encodePng(size, (px, py) => {
    // Le centre du pixel, pas son coin : c'est lui que la distance mesure.
    const x = px + 0.5;
    const y = py + 0.5;

    for (const shape of shapes) {
      const offsetX = Math.abs(x - shape.centerX) - shape.insetX;
      const offsetY = Math.abs(y - shape.centerY) - shape.insetY;
      // Rejet grossier avant la racine carree.
      if (offsetX > shape.radius + 1 || offsetY > shape.radius + 1) continue;

      // Distance signee au rectangle arrondi, puis couverture du pixel.
      const distance =
        Math.hypot(Math.max(offsetX, 0), Math.max(offsetY, 0)) - shape.radius;
      const cover = Math.min(1, Math.max(0, 0.5 - distance));
      if (cover <= 0) continue;

      const ink: Rgb = mono
        ? MONO
        : shape.open
          ? ramp((x - shape.left) / shape.width)
          : CLOSED;

      if (!background) return [...ink, Math.round(cover * 255)];

      // Sur un fond opaque, la couverture se resout en melange : l'icone
      // pleine n'a aucune raison de porter de la transparence.
      return [
        Math.round(background[0] + (ink[0] - background[0]) * cover),
        Math.round(background[1] + (ink[1] - background[1]) * cover),
        Math.round(background[2] + (ink[2] - background[2]) * cover),
        255,
      ];
    }

    return empty;
  });
}

const ROOT = resolve(import.meta.dirname, '..');

/*
 * Expo se charge lui-meme de decliner les densites au moment du build : on ne
 * produit donc que les sources, la ou Capacitor demandait cinq mipmaps.
 */
const assets = join(ROOT, 'mobile', 'assets');
mkdirSync(assets, { recursive: true });

// Icone pleine, fond compris : le motif occupe 63 % du cote, ce qui lui laisse
// de quoi survivre a un masque rond.
writeFileSync(join(assets, 'icon.png'), draw(1024, { scale: 1.15, background: GROUND }));

/*
 * Premier plan de l'icone adaptative.
 *
 * Android n'affiche que les 72 dp centraux d'un canevas de 108, soit 66 %. Le
 * motif occupant 55 % du carre de dessin, un carre a 0,727 le pose sur 40 % du
 * canevas — donc 60 % de ce qu'on voit, quel que soit le masque du lanceur.
 */
writeFileSync(
  join(assets, 'android-icon-foreground.png'),
  draw(1024, { scale: 0.727, background: null }),
);

/*
 * La silhouette des icones themees d'Android 13+.
 *
 * Elle etait jusqu'ici le fichier de premier plan copie tel quel, et l'ancien
 * motif y rendait un pave uniforme. La colonne, elle, porte son sens dans sa
 * geometrie : le creneau ouvert reste plus large et plus haut que les trois
 * autres quand toute couleur a disparu.
 */
writeFileSync(
  join(assets, 'android-icon-monochrome.png'),
  draw(1024, { scale: 0.727, background: null, mono: true }),
);

writeFileSync(join(assets, 'splash-icon.png'), draw(512, { scale: 0.95, background: null }));
writeFileSync(join(assets, 'favicon.png'), draw(64, { scale: 1.35, background: GROUND }));

console.log('icones Expo ecrites dans mobile/assets');
