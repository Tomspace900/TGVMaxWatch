import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const DIR = join(import.meta.dirname, '..', '.github', 'workflows');

/**
 * Un `uses:` local pendant rend le workflow entier invalide, pas seulement le
 * job qui le porte : GitHub resout la reference au moment de parser le fichier.
 * La suppression de la PWA a ainsi emporte une journee de collecte, sans qu'un
 * seul run rouge ne le signale — il n'y avait plus de run du tout.
 */
describe('workflows', () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith('.yml'));

  it('il y a bien des workflows a verifier', () => {
    assert.ok(files.length > 0);
  });

  for (const file of files) {
    it(`${file} ne reference que des workflows existants`, () => {
      const content = readFileSync(join(DIR, file), 'utf8');
      const matches = content.matchAll(/^\s*uses:\s*(\.\/\S+)\s*$/gm);

      for (const [, target] of matches) {
        assert.ok(
          existsSync(join(import.meta.dirname, '..', target!)),
          `${file} appelle ${target}, qui n'existe pas`,
        );
      }
    });
  }
});
