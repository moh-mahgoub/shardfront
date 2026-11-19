// Builds standalone.html: the whole game (CSS + every module) inlined into ONE
// file that also works when opened straight from disk (file://), where browsers
// refuse to load ES modules.  node tools/bundle.mjs
// Each module is wrapped in a function scope, so no renaming is needed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const order = [], seen = new Set(), code = {};

function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  let src = fs.readFileSync(file, 'utf8');
  const exports = [];
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm, (m, names, rel) => {
    const dep = path.resolve(path.dirname(file), rel);
    visit(dep);
    return `const {${names}} = __m[${JSON.stringify(path.relative(root, dep))}];`;
  });
  if (/^import\s/m.test(src)) throw new Error('Unsupported import form in ' + file);
  src = src.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z0-9_$]+)/gm, (m, kind, name) => { exports.push(name); return kind + ' ' + name; });
  if (/^export\s/m.test(src)) throw new Error('Unsupported export form in ' + file);
  code[file] = `__m[${JSON.stringify(path.relative(root, file))}] = (function () {\n${src}\nreturn { ${exports.join(', ')} };\n})();\n`;
  order.push(file);
}
visit(path.join(root, 'src/client/main.js'));

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const js = '"use strict";\nconst __m = {};\n' + order.map(f => code[f]).join('\n');
html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + css + '</style>')
  .replace('<link rel="manifest" href="manifest.webmanifest">\n', '')
  .replace('<script type="module" src="src/client/main.js"></script>', () => '<script>\n' + js.replace(/<\/script/g, '<\\/script') + '</script>');
fs.writeFileSync(path.join(root, 'standalone.html'), html);
console.log(`standalone.html written (${(html.length / 1024).toFixed(0)} KB, ${order.length} modules)`);
