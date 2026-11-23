/**
 * tools/appscript_local.js — Apps Script simulado en tu PC
 * =========================================================================
 *   node tools/appscript_local.js [puerto]        (por defecto 4601)
 *
 * Ejecuta el 00_Config/Code.gs REAL sobre un Sheets/Drive en memoria
 * (tools/gas_fake.js) y lo publica en http://127.0.0.1:<puerto>/exec igual
 * que una implementación web de Google: GET = estado, POST = API, CORS
 * abierto y SIN responder "preflight" (como Google: si la app enviara una
 * petición no simple, fallaría aquí igual que en producción).
 *
 * Al arrancar ejecuta _CrearProyecto. Admin inicial: el de CONFIG.ADMIN_INICIAL
 * (DNI 00000000 · Cambiar2026). Los datos viven en memoria: se pierden al
 * cerrar.
 *
 * Para probar la app contra este backend:
 *   DB_PROVIDER=appscript APPS_SCRIPT_URL=http://127.0.0.1:4601/exec npm run build
 * =========================================================================
 */
const http = require('http');
const path = require('path');
const { cargarCodeGs } = require('./gas_fake');

const PUERTO = parseInt(process.argv[2], 10) || 4601;
const env = cargarCodeGs(path.join(__dirname, '..', '00_Config', 'Code.gs'),
                         { urlWeb: 'http://127.0.0.1:' + PUERTO + '/exec' });
const raiz = env.nuevaCarpeta('SSOMA (simulado)');
env.ejecutar(`CONFIG.ROOT_FOLDER_ID = '${raiz.getId()}'`);
const rep = env.sandbox._CrearProyecto();

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/exec') { res.writeHead(404); return res.end('Solo /exec'); }
  if (req.method === 'OPTIONS') { res.writeHead(405); return res.end(); }   // Google no responde preflight
  if (req.method === 'GET') {
    const out = env.sandbox.doGet({ parameter: Object.fromEntries(url.searchParams) });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(out.getContent());
  }
  if (req.method === 'POST') {
    const trozos = [];
    req.on('data', t => trozos.push(t));
    req.on('end', () => {
      const out = env.sandbox.doPost({ postData: { contents: Buffer.concat(trozos).toString('utf8') } });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(out.getContent());
    });
    return;
  }
  res.writeHead(405); res.end();
}).listen(PUERTO, '127.0.0.1', () => {
  console.log(rep.lineas.filter(l => /Pestaña|Administrador|DATA/.test(l)).slice(-3).join('\n'));
  console.log('✅ Apps Script simulado en http://127.0.0.1:' + PUERTO + '/exec  (admin: 00000000 / Cambiar2026)');
});

module.exports = { env };
