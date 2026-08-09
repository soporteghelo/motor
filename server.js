const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3005;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
  const urlPath   = req.url === '/' ? '/LOCAL_PREVIEW.html' : req.url.split('?')[0];
  const filePath  = path.join(ROOT, urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - No encontrado: ' + urlPath);
      return;
    }
    const ext         = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
