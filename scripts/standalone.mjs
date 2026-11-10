import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = new URL('../dist/', import.meta.url);
let html = await readFile(new URL('index.html', output), 'utf8');
const script = html.match(/<script type="module"[^>]* src="([^"]+)"><\/script>/);
const style = html.match(/<link rel="stylesheet"[^>]* href="([^"]+)">/);
if (!script || !style) throw new Error('Expected one bundled script and one stylesheet.');

const asset = (path) => readFile(new URL(path.replace(/^\//, ''), output), 'utf8');
const [js, css] = await Promise.all([asset(script[1]), asset(style[1])]);
html = html.replace(script[0], () => '<script type="module">' +
  js.replace(/<\/script/gi, '<\\/script') + '</script>');
html = html.replace(style[0], () => '<style>' + css + '</style>');

const file = new URL('Range 03.html', output);
await writeFile(file, html);
console.log('Standalone demo written to ' + resolve('dist', 'Range 03.html'));
