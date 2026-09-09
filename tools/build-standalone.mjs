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
  'src/render/craft-art.js',
  'src/render/sprites.js',
  'src/render/ui.js',
  'src/core/input.js',
  'src/core/touch.js',
  'src/core/audio.js',
  'src/game/craft.js',
  'src/game/gear.js',
  'src/game/pickup.js',
  'src/game/weapons.js',
  'src/game/levels.js',
  'src/game/background.js',
  'src/game/corridor.js',
  'src/game/bullet.js',
  'src/game/effects.js',
  'src/game/player.js',
  'src/game/wingman.js',
  'src/game/enemy.js',
  'src/game/boss.js',
  'src/game/parachutist.js',
  'src/net/protocol.js',
  'src/net/transport.js',
  'src/net/remote.js',
  'src/net/snapshot.js',
  'src/net/room.js',
  'src/net/link.js',
  'src/game/selectscreen.js',
  'src/game/lobby.js',
  'src/game/loadout.js',
  'src/game/debug.js',
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

/** Source with comments and string bodies blanked, for identifier scanning. */
function scannable(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function namesIn(pattern, source) {
  const found = new Set();
  for (const match of source.matchAll(pattern)) {
    for (const part of match[1].split(',')) {
      const name = part.split(/\bas\b/).pop().trim();
      if (name) found.add(name);
    }
  }
  return found;
}

/**
 * Every module must import what it uses.
 *
 * Concatenating the modules puts them all in one scope, so a module that
 * forgot an import still works in the bundle and only fails when the real ES
 * modules are loaded. That is a nasty asymmetry: the thing that ships is more
 * forgiving than the thing that is developed against. This turns it into a
 * build error instead.
 */
function assertImportsComplete(sources) {
  const exporters = new Map();
  for (const { file, code } of sources) {
    for (const name of namesIn(/^export\s+\{([^}]*)\}/gm, code)) exporters.set(name, file);
    for (const [, name] of code.matchAll(/^export\s+(?:async\s+)?(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
      exporters.set(name, file);
    }
  }

  for (const { file, code } of sources) {
    const imported = namesIn(/^import\s*\{([^}]*)\}\s*from/gm, code);
    const declared = new Set();
    for (const [, name] of code.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
      declared.add(name);
    }
    const body = scannable(code.replace(/^import[^;]*;$/gm, ''));
    for (const [name, from] of exporters) {
      if (from === file || imported.has(name) || declared.has(name)) continue;
      if (new RegExp(`\\b${name}\\b`).test(body)) {
        throw new Error(
          `${file} uses "${name}" (exported by ${from}) without importing it. `
          + 'It would work once bundled and fail as a module.',
        );
      }
    }
  }
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

const raw = [];
for (const file of MODULES) raw.push({ file, code: await readFile(join(root, file), 'utf8') });
assertImportsComplete(raw);

const bundle = chunks.map(({ file, code }) => `// ---- ${file} ----\n${code}`).join('\n\n');

const html = await readFile(join(root, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/^\s*<meta[^>]*>\s*$/gm, '')
  .trim();
// Only the module entry point becomes the bundle. Any other script tag — the
// signalling library, for one — is left exactly where it is: an earlier
// version of this matched the first src= it found, which quietly inlined the
// bundle in place of the wrong tag and left main.js as a dangling reference.
const ENTRY = /<script[^>]*type="module"[^>]*src="\.\/src\/main\.js"[^>]*><\/script>/;
const rawBody = html.match(/<body>([\s\S]*?)<\/body>/)[1];
if (!ENTRY.test(rawBody)) {
  throw new Error('index.html no longer has the module entry point this build replaces');
}
const body = rawBody
  .replace(ENTRY, `<script type="module">\n${bundle}\n</script>`)
  .trim();
if (/<script[^>]*src="\.\//.test(body)) {
  throw new Error('a local script survived bundling; the single file would not run standalone');
}

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
