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

    /*
     * Une expression `${{ }}` dans un bloc `run:` est substituee
     * **textuellement, avant que le shell ne lise la ligne**. Sur du contenu
     * ecrit par un humain — un message de commit, un titre d'issue, une entree
     * de `workflow_dispatch` — c'est a la fois une porte d'injection et une
     * panne : ce depot parseme ses messages de commit d'accents graves, et l'un
     * d'eux ouvrant sur un chevron a fait sortir `eas update` en code 2. La
     * mise a jour n'est jamais partie, `ci` est reste vert, et le telephone a
     * garde pendant une journee un code qui ne savait plus lire les donnees
     * publiees.
     *
     * Les valeurs sures restent autorisees : `secrets.*` et les champs que
     * GitHub fabrique lui-meme (`github.sha`, `github.ref`…) ne portent pas de
     * texte libre. Tout le reste passe par `env:`, ou le shell ne le relit pas.
     */
    it(`${file} n interpole aucun texte libre dans un run`, () => {
      const content = readFileSync(join(DIR, file), 'utf8');
      const safe = /^(secrets|env|vars|runner|matrix|strategy|job|needs)\.|^github\.(sha|ref|ref_name|repository|repository_owner|run_id|run_number|actor|workspace|event_name|token|server_url|api_url)$/;

      for (const [, expression] of blocksOf(content, 'run').flatMap((block) => [
        ...block.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g),
      ])) {
        const first = expression!.split(/\s*(?:\|\||&&)\s*/)[0]!.trim();
        assert.ok(
          safe.test(first),
          `${file} interpole « ${expression} » dans un run : passer par env:`,
        );
      }
    });
  }
});

/**
 * Les blocs `<key>: |` d'un workflow, rendus sans leur en-tete.
 *
 * Une analyse ligne a ligne sur l'indentation, et non un parseur YAML : ce test
 * ne doit dependre de rien, il tourne dans le meme `npm test` que le
 * collecteur.
 */
function blocksOf(content: string, key: string): string[] {
  const lines = content.split('\n');
  const blocks: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const start = new RegExp(`^(\\s*)-?\\s*${key}:\\s*[|>][-+]?\\s*$`).exec(lines[i]!);
    if (!start) {
      // `run: une seule ligne` compte aussi.
      const inline = new RegExp(`^\\s*-?\\s*${key}:\\s+(\\S.*)$`).exec(lines[i]!);
      if (inline) blocks.push(inline[1]!);
      continue;
    }

    const indent = start[1]!.length;
    const body: string[] = [];
    while (++i < lines.length) {
      const line = lines[i]!;
      if (line.trim() !== '' && line.search(/\S/) <= indent) break;
      body.push(line);
    }
    i--;
    blocks.push(body.join('\n'));
  }

  return blocks;
}
