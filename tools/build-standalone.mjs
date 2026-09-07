/**
 * Bundles the game into one self-contained HTML file.
 *
 * The sources are plain ES modules with no circular imports, so "bundling" is
 * just concatenating them in dependency order and dropping the import/export
 * statements. No dependencies, no config, no build step in development.
 *
 *   node tools/build-standalone.mjs             -> dist/chrono-pilot.html
 *   node tools/build-standalone.mjs --fragment  -> also dist/chrono-pilot.fragment.html
 *                                                  (no <html>/<head>/<body>, for
 *                                                   hosts that supply their own)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Dependency order: every module only uses names defined above it.
const MODULES = [
  'src/core/math.js',
  'src/core/loop.js',
  'src/core/input.js',
  'src/core/touch.js',
  'src/core/audio.js',
  'src/render/sprites.js',
  'src/game/levels.js',
  'src/game/background.js',
  'src/game/bullet.js',
  'src/game/effects.js',
  'src/game/player.js',
  'src/game/enemy.js',
  'src/game/boss.js',
  'src/game/parachutist.js',
  'src/game/hud.js',
  'src/game/game.js',
  'src/main.js',
];

function stripModuleSyntax(source) {
  return source
    .replace(/^import[^;]*;$/gm, '')            // import { a, b } from '...';
    .replace(/^export\s*\{[^}]*\}\s*;?$/gm, '') // export { A };
    .replace(/^export\s+(?=(?:class|function|const|let|var|async)\b)/gm, '')
    .trim();
}

/** Guards against two modules declaring the same top-level name. */
function assertNoCollisions(chunks) {
  const seen = new Map();
  const declaration = /^(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
  for (const { file, code } of chunks) {
    for (const [, name] of code.matchAll(declaration)) {
      if (seen.has(name)) {
        throw new Error(`Top-level name "${name}" is declared in both ${seen.get(name)} and ${file}`);
      }
      seen.set(name, file);
    }
  }
}

const chunks = [];
for (const file of MODULES) {
  chunks.push({ file, code: stripModuleSyntax(await readFile(join(root, file), 'utf8')) });
}
assertNoCollisions(chunks);

const bundle = chunks.map(({ file, code }) => `// ---- ${file} ----\n${code}`).join('\n\n');

const html = await readFile(join(root, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/^\s*<meta[^>]*>\s*$/gm, '')
  .trim();
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/, `<script type="module">\n${bundle}\n</script>`)
  .trim();

const fragment = `${head}\n${body}\n`;
const standalone = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>
${body}
</body>
</html>
`;

await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist/chrono-pilot.html'), standalone);
if (process.argv.includes('--fragment')) {
  await writeFile(join(root, 'dist/chrono-pilot.fragment.html'), fragment);
}
console.log(`dist/chrono-pilot.html  ${(standalone.length / 1024).toFixed(1)} KB`);
