import { mkdir, rm, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { S } from '../app/strings.js';
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(`${root}dist`, { recursive: true, force: true });
await mkdir(`${root}dist`, { recursive: true });
await cp(`${root}app`, `${root}dist`, { recursive: true });
const escape = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const indexHtml = await readFile(`${root}app/index.html`, 'utf8');
await writeFile(`${root}dist/index.html`, indexHtml.replace('__APP_NAME__', escape(S.app)).replace('__JAVASCRIPT_REQUIRED__', escape(S.javascriptRequired)));
const digest = createHash('sha256');
async function hashDirectory(path) {
  for (const item of (await readdir(path, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    if (item.isDirectory()) await hashDirectory(`${path}/${item.name}`);
    else { digest.update(item.name); digest.update(await readFile(`${path}/${item.name}`)); }
  }
}
await hashDirectory(`${root}app`);
const release = digest.digest('hex').slice(0,16);
const sw = await readFile(`${root}app/sw.js`, 'utf8');
await writeFile(`${root}dist/sw.js`, sw.replace('__RELEASE__', release));
const manifest = JSON.parse(await readFile(`${root}dist/manifest.webmanifest`, 'utf8'));
manifest.name = S.app; manifest.short_name = S.app;
await writeFile(`${root}dist/manifest.webmanifest`, JSON.stringify(manifest, null, 2) + '\n');
await writeFile(`${root}dist/.nojekyll`, '');
console.log(`Chumlog ${S.version}: dist/ ready (${release}).`);
