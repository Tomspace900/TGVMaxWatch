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

/** Encode une image RGB en PNG sans perte. */
function encodePng(size: number, pixel: (x: number, y: number) => Rgb): Buffer {
  // Une ligne = un octet de filtre (0 = aucun) suivi des triplets RGB.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;

  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profondeur
  header[9] = 2; // truecolor
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

function draw(size: number): Buffer {
  // Marge generreuse : l'icone doit rester lisible une fois masquee en rond.
  const margin = Math.round(size * 0.19);
  const inner = size - margin * 2;
  const gap = Math.max(1, Math.round(size * 0.022));
  const cell = (inner - gap * 3) / 4;

  return encodePng(size, (x, y) => {
    const column = Math.floor((x - margin) / (cell + gap));
    const row = Math.floor((y - margin) / (cell + gap));
    if (column < 0 || column > 3 || row < 0 || row > 3) return BACKGROUND;

    // Rejette les pixels tombant dans la gouttiere entre deux cases.
    const withinX = (x - margin) - column * (cell + gap);
    const withinY = (y - margin) - row * (cell + gap);
    if (withinX >= cell || withinY >= cell) return BACKGROUND;

    return SCALE[PATTERN[row * 4 + column]!]!;
  });
}

const target = resolve(import.meta.dirname, '..', 'web', 'public');
mkdirSync(target, { recursive: true });

for (const size of [192, 512]) {
  writeFileSync(join(target, `icon-${size}.png`), draw(size));
  console.log(`icon-${size}.png ecrit`);
}
