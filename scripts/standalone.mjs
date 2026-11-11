import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../dist/', import.meta.url);
const index = new URL('index.html', output);
let html = await readFile(index, 'utf8');
const script = html.match(/<script type="module"[^>]* src="([^"]+)"><\/script>/);
const style = html.match(/<link rel="stylesheet"[^>]* href="([^"]+)">/);
if (!script || !style) throw new Error('Expected one bundled script and one stylesheet.');

const asset = (path) => readFile(new URL(path.replace(/^\//, ''), output), 'utf8');
const [js, css, projectLicense, dependencyLicenseJson] = await Promise.all([
  asset(script[1]),
  asset(style[1]),
  readFile(new URL('../LICENSE', import.meta.url), 'utf8'),
  readFile(new URL('dependency-licenses.json', output), 'utf8'),
]);
const dependencyLicenses = JSON.parse(dependencyLicenseJson);
for (const { name, version, identifier, text } of dependencyLicenses) {
  if (identifier !== 'MIT' || !text?.trim()) {
    throw new Error(`Review the browser dependency license for ${name}@${version} (${identifier ?? 'unknown'}).`);
  }
}
const dependencyNotices = dependencyLicenses
  .map(({ name, version, text }) => `${name}@${version}\n${text.trim()}`)
  .join('\n\n');
const notices = `<!--
Quad-Viz
${projectLicense.trim()}

${dependencyNotices}
-->
`;
html = html.replace('</head>', () => notices + '</head>');
await writeFile(index, html);
html = html.replace(script[0], () => '<script type="module">' +
  js.replace(/<\/script/gi, '<\\/script') + '</script>');
html = html.replace(style[0], () => '<style>' + css + '</style>');

const file = new URL('quad-viz.html', output);
await writeFile(file, html);
console.log('Standalone demo written to ' + fileURLToPath(file));
