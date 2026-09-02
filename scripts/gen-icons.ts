/**
 * Genere les icones PNG de la PWA.
 *
 * Le motif est la grille de disponibilite du calendrier, pas un logo : c'est
 * l'identite du produit. Rien d'illustratif, aucune dependance graphique — le
 * PNG est encode a la main avec `node:zlib`, seul module necessaire.
 *
 *   node scripts/gen-icons.ts
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type Rgb = [number, number, number];

const BACKGROUND: Rgb = [12, 14, 16];
/** Les quatre paliers de l'echelle de disponibilite, du vide au sature. */
const SCALE: Rgb[] = [
  [27, 31, 34],
  [20, 80, 58],
  [30, 138, 97],
  [53, 209, 151],
];

/** Intensite de chaque case du motif 4x4, dans l'ordre de lecture. */
const PATTERN = [
  1, 2, 0, 3,
  2, 3, 1, 3,
  0, 1, 3, 2,
  3, 2, 2, 1,
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

/** `null` = pixel transparent. */
type Pixel = Rgb | null;

/**
 * Encode une image en PNG sans perte.
 *
 * L'alpha n'est pas un agrement : l'icone adaptative Android superpose un
 * premier plan a un fond, et un premier plan opaque masquerait ce fond.
 */
function encodePng(size: number, pixel: (x: number, y: number) => Pixel): Buffer {
  // Une ligne = un octet de filtre (0 = aucun) suivi des quadruplets RGBA.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;

  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const color = pixel(x, y);
      raw[offset++] = color ? color[0] : 0;
      raw[offset++] = color ? color[1] : 0;
      raw[offset++] = color ? color[2] : 0;
      raw[offset++] = color ? 255 : 0;
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

interface DrawOptions {
  /** Part du cote laissee vide autour du motif. */
  margin: number;
  /** Fond opaque, ou transparent pour un premier plan adaptatif. */
  background: Rgb | null;
}

function draw(size: number, { margin, background }: DrawOptions): Buffer {
  const inset = Math.round(size * margin);
  const inner = size - inset * 2;
  const gap = Math.max(1, Math.round(inner * 0.03));
  const cell = (inner - gap * 3) / 4;

  return encodePng(size, (x, y) => {
    const column = Math.floor((x - inset) / (cell + gap));
    const row = Math.floor((y - inset) / (cell + gap));
    if (column < 0 || column > 3 || row < 0 || row > 3) return background;

    // Rejette les pixels tombant dans la gouttiere entre deux cases.
    const withinX = x - inset - column * (cell + gap);
    const withinY = y - inset - row * (cell + gap);
    if (withinX >= cell || withinY >= cell) return background;

    return SCALE[PATTERN[row * 4 + column]!]!;
  });
}

const ROOT = resolve(import.meta.dirname, '..');

// --- PWA -------------------------------------------------------------------
const web = join(ROOT, 'web', 'public');
mkdirSync(web, { recursive: true });

for (const size of [192, 512]) {
  // Marge generreuse : l'icone doit rester lisible une fois masquee en rond.
  writeFileSync(join(web, `icon-${size}.png`), draw(size, { margin: 0.19, background: BACKGROUND }));
  console.log(`icon-${size}.png ecrit`);
}

// --- Android ---------------------------------------------------------------
/** Cotes de `ic_launcher`, par densite. */
const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
/** Cotes de `ic_launcher_foreground` : 108 dp, dont seuls les 72 dp centraux
 *  sont garantis visibles une fois le masque du lanceur applique. */
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const res = join(ROOT, 'web', 'android', 'app', 'src', 'main', 'res');

for (const [density, size] of Object.entries(LAUNCHER)) {
  const dir = join(res, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });

  const legacy = draw(size, { margin: 0.19, background: BACKGROUND });
  writeFileSync(join(dir, 'ic_launcher.png'), legacy);
  writeFileSync(join(dir, 'ic_launcher_round.png'), legacy);

  // 28 % de marge : le motif tient dans la zone sure des 72 dp centraux, quel
  // que soit le masque — rond, carre arrondi ou goutte selon le lanceur.
  writeFileSync(
    join(dir, 'ic_launcher_foreground.png'),
    draw(FOREGROUND[density as keyof typeof FOREGROUND], { margin: 0.28, background: null }),
  );
  console.log(`mipmap-${density} ecrit`);
}

const background = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0C0E10</color>
</resources>
`;
writeFileSync(join(res, 'values', 'ic_launcher_background.xml'), background);
console.log('ic_launcher_background.xml ecrit');
