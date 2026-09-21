import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const target = path.join(root, 'apps-script');

const [html, css, js] = await Promise.all([
  readFile(path.join(root, 'index.html'), 'utf8'),
  readFile(path.join(root, 'styles.css'), 'utf8'),
  readFile(path.join(root, 'app.js'), 'utf8')
]);

const index = html
  .replace('<head>', '<head>\n  <base target="_top">')
  .replace('<link rel="stylesheet" href="styles.css">', "<?!= include('Styles'); ?>")
  .replace('<script src="app.js"></script>', "<?!= include('App'); ?>");

await Promise.all([
  writeFile(path.join(target, 'Index.html'), index),
  writeFile(path.join(target, 'Styles.html'), `<style>\n${css}\n</style>\n`),
  writeFile(path.join(target, 'App.html'), `<script>\n${js}\n</script>\n`)
]);

console.log('Apps Script HTML atualizado.');
