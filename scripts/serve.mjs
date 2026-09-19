import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
export function makeServer() {
  return createServer(async (request,response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      // A project subdirectory in QA exercises GitHub Pages URL behaviour.
      let path = decodeURIComponent(url.pathname).replace(/^\/chumlog\//,'/');
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error('PATH');
      const content = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache' });
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--port');
  const port = Number(index >= 0 ? process.argv[index + 1] : process.env.PORT || 4173);
  makeServer().listen(port, '0.0.0.0', () => console.log(`Chumlog: http://localhost:${port}`));
}
