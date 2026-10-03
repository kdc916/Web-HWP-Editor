import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

export function serve(root = 'docs', port = 4173) {
  const directory = resolve(root);
  const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.hwp':'application/x-hwp' };
  const server = http.createServer(async (req,res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      pathname = pathname.replace(/^\/(Web-HWP-Editor|renamed-project)\//,'/');
      let file = resolve(directory,'.'+pathname);
      if (file !== directory && !file.startsWith(directory + sep)) throw new Error('Invalid path');
      if ((await stat(file)).isDirectory()) file = resolve(file,'index.html');
      const data = await readFile(file);
      res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  return new Promise(resolvePromise => server.listen(port,'127.0.0.1',()=>resolvePromise(server)));
}
if (process.argv[1]?.endsWith('serve.mjs')) {
  const server = await serve(process.argv[2] || 'docs', Number(process.env.PORT || 4173));
  console.log(`Web HWP Editor: http://127.0.0.1:${server.address().port}`);
}
