/**
 * tools/gas_fake.js — simulador en memoria de los servicios de Apps Script
 * =========================================================================
 * Permite ejecutar 00_Config/Code.gs en Node (pruebas y servidor local) sin
 * Google. Reproduce a propósito los límites que suelen romper scripts reales:
 *   · una pestaña nueva trae 1000 filas × 26 columnas: escribir fuera lanza
 *     "Those rows/columns are out of bounds" (hay que insertar antes)
 *   · no se pueden borrar todas las filas no inmovilizadas
 *   · sin formato de texto (@), "00123" se guarda como número 123 y un texto
 *     que empieza por "=" se convierte en fórmula
 *   · CacheService guarda como máximo 6 h
 * =========================================================================
 */
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const firmados = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
const aBuffer = bytes => Buffer.from(bytes.map(b => (b < 0 ? b + 256 : b)));
const iterador = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };

function crearEntorno(opts) {
  opts = opts || {};
  const estado = { propietario: 'dueno@ejemplo.com', activo: 'dueno@ejemplo.com', logs: [], correos: [], urlWeb: opts.urlWeb || 'https://script.google.com/macros/s/FAKE/exec' };
  let seq = 0;
  const nuevoId = p => (p || 'id') + '_' + (++seq).toString(36) + crypto.randomBytes(12).toString('hex');

  // ── Drive ────────────────────────────────────────────────────────────────
  const carpetas = {}, archivos = {};
  class Carpeta {
    constructor(nombre, padre) { this.id = nuevoId('fld'); this.nombre = nombre; this.padre = padre || null; carpetas[this.id] = this; }
    getId() { return this.id; } getName() { return this.nombre; } getUrl() { return 'https://drive.google.com/drive/folders/' + this.id; }
    getFoldersByName(n) { return iterador(Object.values(carpetas).filter(c => c.padre === this.id && c.nombre === n)); }
    getFolders() { return iterador(Object.values(carpetas).filter(c => c.padre === this.id)); }
    createFolder(n) { return new Carpeta(n, this.id); }
    createFile(blob) { return new Archivo(blob.getName(), blob.getContentType(), blob.getBytes(), this.id); }
    getFiles() { return iterador(Object.values(archivos).filter(a => a.padres.indexOf(this.id) !== -1 && !a.papelera)); }
    ruta() { return (this.padre && carpetas[this.padre] ? carpetas[this.padre].ruta() + '/' : '') + this.nombre; }
  }
  class Archivo {
    constructor(nombre, mime, bytes, padre) { this.id = nuevoId('file'); this.nombre = nombre; this.mime = mime; this.bytes = bytes || []; this.padres = padre ? [padre] : []; this.descripcion = ''; this.papelera = false; archivos[this.id] = this; }
    getId() { return this.id; } getName() { return this.nombre; } getMimeType() { return this.mime; }
    getSize() { return this.bytes.length; } getUrl() { return 'https://drive.google.com/file/d/' + this.id + '/view'; }
    getBlob() { return new Blob(this.bytes, this.mime, this.nombre); }
    getDescription() { return this.descripcion; } setDescription(d) { this.descripcion = d; return this; }
    getParents() { return iterador(this.padres.map(p => carpetas[p]).filter(Boolean)); }
    moveTo(c) { this.padres = [c.getId()]; return this; }
    setTrashed(b) { this.papelera = !!b; return this; } isTrashed() { return this.papelera; }
  }
  class Blob {
    constructor(bytes, mime, nombre) { this.bytes = typeof bytes === 'string' ? firmados(Buffer.from(bytes, 'utf8')) : bytes; this.mime = mime; this.nombre = nombre; }
    getBytes() { return this.bytes; } getContentType() { return this.mime; } getName() { return this.nombre; }
    setName(n) { this.nombre = n; return this; } getDataAsString() { return aBuffer(this.bytes).toString('utf8'); }
  }
  const miUnidad = new Carpeta('Mi unidad', null);
  const DriveApp = {
    getFolderById(id) { const c = carpetas[id]; if (!c) throw new Error('No se encontró el elemento con el id especificado: ' + id); return c; },
    getFileById(id) { const a = archivos[id]; if (!a) throw new Error('No se encontró el archivo: ' + id); return a; },
    getRootFolder() { return miUnidad; },
    createFolder(n) { return miUnidad.createFolder(n); }
  };

  // ── Sheets ───────────────────────────────────────────────────────────────
  const libros = {};
  class Hoja {
    constructor(nombre) { this.nombre = nombre; this.datos = []; this.texto = {}; this.maxR = 1000; this.maxC = 26; this.frozen = 0; }
    getName() { return this.nombre; }
    getLastRow() { for (let r = this.datos.length; r > 0; r--) if ((this.datos[r - 1] || []).some(v => v !== '' && v != null)) return r; return 0; }
    getLastColumn() { let c = 0; this.datos.forEach(f => { for (let i = (f || []).length; i > 0; i--) if (f[i - 1] !== '' && f[i - 1] != null) { c = Math.max(c, i); break; } }); return c; }
    getMaxRows() { return this.maxR; } getMaxColumns() { return this.maxC; }
    insertRowsAfter(tras, n) { this.maxR += n; if (tras < this.datos.length) this.datos.splice(tras, 0, ...Array.from({ length: n }, () => [])); return this; }
    insertColumnsAfter(tras, n) { this.maxC += n; return this; }
    deleteRows(ini, n) {
      if (this.maxR - n <= this.frozen) throw new Error("You can't delete all the rows on the sheet that are not frozen.");
      this.datos.splice(ini - 1, n);
      // desplaza las marcas de formato de texto
      const nuevo = {};
      Object.keys(this.texto).forEach(k => { const [r, c] = k.split(',').map(Number); if (r < ini) nuevo[k] = 1; else if (r >= ini + n) nuevo[(r - n) + ',' + c] = 1; });
      this.texto = nuevo; this.maxR -= n; return this;
    }
    deleteRow(r) { return this.deleteRows(r, 1); }
    setFrozenRows(n) { this.frozen = n; return this; } getFrozenRows() { return this.frozen; }
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('Rango inválido');
      if (r + nr - 1 > this.maxR) throw new Error('Those rows are out of bounds.');
      if (c + nc - 1 > this.maxC) throw new Error('Those columns are out of bounds.');
      return new Rango(this, r, c, nr, nc);
    }
    getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    appendRow(arr) { const r = this.getLastRow() + 1; if (r > this.maxR) this.maxR = r; this.getRange(r, 1, 1, arr.length).setValues([arr]); return this; }
    clear() { this.datos = []; return this; }
  }
  class Rango {
    constructor(h, r, c, nr, nc) { Object.assign(this, { h, r, c, nr, nc }); }
    getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const f = this.h.datos[this.r - 1 + i] || []; const fila = []; for (let j = 0; j < this.nc; j++) { const v = f[this.c - 1 + j]; fila.push(v == null ? '' : v); } o.push(fila); } return o; }
    setValues(m) {
      if (m.length !== this.nr || m.some(f => f.length !== this.nc)) throw new Error('The number of rows/columns in the data does not match the range.');
      for (let i = 0; i < this.nr; i++) {
        const r = this.r + i;
        this.h.datos[r - 1] = this.h.datos[r - 1] || [];
        for (let j = 0; j < this.nc; j++) {
          const cc = this.c + j;
          let v = m[i][j];
          const esTexto = !!this.h.texto[r + ',' + cc];
          if (typeof v === 'string') {
            if (v.startsWith("'")) v = v.slice(1);                       // apóstrofo = literal
            else if (v.startsWith('=')) v = '#FORMULA:' + v;            // Sheets la evaluaría
            else if (!esTexto && /^-?\d+(\.\d+)?$/.test(v)) v = Number(v); // pierde ceros iniciales
          }
          this.h.datos[r - 1][cc - 1] = v;
        }
      }
      return this;
    }
    setNumberFormat(f) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) { const k = (this.r + i) + ',' + (this.c + j); if (f === '@') this.h.texto[k] = 1; else delete this.h.texto[k]; } return this; }
    setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
    clearContent() { for (let i = 0; i < this.nr; i++) { const f = this.h.datos[this.r - 1 + i]; if (f) for (let j = 0; j < this.nc; j++) f[this.c - 1 + j] = ''; } return this; }
  }
  class Libro {
    constructor(nombre) { this.id = nuevoId('sheet'); this.nombre = nombre; this.hojas = [new Hoja('Hoja 1')]; this.tz = ''; libros[this.id] = this; }
    getId() { return this.id; } getName() { return this.nombre; } getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
    getSheets() { return this.hojas.slice(); } getSheetByName(n) { return this.hojas.find(h => h.nombre === n) || null; }
    insertSheet(n) { if (this.getSheetByName(n)) throw new Error('Ya existe una hoja con el nombre "' + n + '"'); const h = new Hoja(n); this.hojas.push(h); return h; }
    deleteSheet(h) { if (this.hojas.length === 1) throw new Error('No se puede borrar la única hoja'); this.hojas = this.hojas.filter(x => x !== h); }
    setSpreadsheetTimeZone(tz) { this.tz = tz; }
  }
  const SpreadsheetApp = {
    openById(id) { const l = libros[id]; if (!l) throw new Error('No se encontró la hoja de cálculo con el id ' + id); return l; },
    create(nombre) { const l = new Libro(nombre); const a = new Archivo(nombre, 'application/vnd.google-apps.spreadsheet', [], miUnidad.id); delete archivos[a.id]; a.id = l.id; archivos[l.id] = a; return l; },
    getUi() { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); }
  };

  // ── Utilidades ───────────────────────────────────────────────────────────
  function formatDate(fecha, tz, patron) {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .formatToParts(fecha).forEach(x => { p[x.type] = x.value; });
    if (p.hour === '24') p.hour = '00';
    return String(patron).replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (t, lit) =>
      lit !== undefined ? lit : ({ yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second })[t]);
  }
  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5', SHA_1: 'sha1' },
    Charset: { UTF_8: 'utf8' },
    getUuid: () => crypto.randomUUID(),
    base64Decode: s => firmados(Buffer.from(String(s), 'base64')),
    base64Encode: b => aBuffer(typeof b === 'string' ? firmados(Buffer.from(b)) : b).toString('base64'),
    newBlob: (bytes, mime, nombre) => new Blob(bytes, mime, nombre),
    computeDigest: (alg, valor) => firmados(crypto.createHash(alg).update(typeof valor === 'string' ? Buffer.from(valor, 'utf8') : aBuffer(valor)).digest()),
    computeHmacSha256Signature: (valor, clave) => firmados(crypto.createHmac('sha256', typeof clave === 'string' ? Buffer.from(clave, 'utf8') : aBuffer(clave)).update(typeof valor === 'string' ? Buffer.from(valor, 'utf8') : aBuffer(valor)).digest()),
    formatDate,
    sleep: () => {}
  };

  // ── Caché, propiedades, candado ──────────────────────────────────────────
  const cacheMap = new Map();
  const ScriptCache = {
    get(k) { const e = cacheMap.get(k); if (!e) return null; if (e.vence < Date.now()) { cacheMap.delete(k); return null; } return e.v; },
    put(k, v, ttl) { if (typeof v !== 'string') throw new Error('Cache: el valor debe ser texto'); if (v.length > 100 * 1024) throw new Error('Cache: valor > 100 KB'); cacheMap.set(k, { v, vence: Date.now() + Math.min(ttl || 600, 21600) * 1000 }); },
    remove(k) { cacheMap.delete(k); }
  };
  const props = {};
  const ScriptProperties = {
    getProperty: k => (k in props ? props[k] : null), setProperty(k, v) { props[k] = String(v); return this; },
    getProperties: () => Object.assign({}, props), deleteProperty(k) { delete props[k]; return this; }
  };
  let candado = false;
  const Lock = { tryLock() { if (candado) return false; candado = true; return true; }, waitLock() { if (!Lock.tryLock()) throw new Error('Lock timeout'); }, releaseLock() { candado = false; }, hasLock: () => candado };

  const sandbox = {
    console: { log: () => {}, warn: (...a) => estado.logs.push(['warn', a.join(' ')]), error: (...a) => estado.logs.push(['error', a.join(' ')]) },
    Logger: { log: (x) => estado.logs.push(['log', String(x)]) },
    DriveApp, SpreadsheetApp, Utilities,
    CacheService: { getScriptCache: () => ScriptCache },
    PropertiesService: { getScriptProperties: () => ScriptProperties },
    LockService: { getScriptLock: () => Lock },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: s => ({ contenido: s, setMimeType() { return this; }, getContent() { return this.contenido; } }) },
    HtmlService: { XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' }, createTemplateFromFile() { throw new Error('No HTML file named Index was found.'); }, createHtmlOutputFromFile() { throw new Error('sin HTML'); } },
    Session: {
      getActiveUser: () => ({ getEmail: () => estado.activo }),
      getEffectiveUser: () => ({ getEmail: () => estado.propietario }),
      getScriptTimeZone: () => opts.tz || 'America/Lima'
    },
    ScriptApp: { getService: () => ({ getUrl: () => estado.urlWeb }), getOAuthToken: () => 'token-fake' },
    UrlFetchApp: {
      fetch(url) {
        if (!estado.urlWeb || url.indexOf(estado.urlWeb.split('?')[0]) !== 0) return { getResponseCode: () => 404, getContentText: () => 'not found' };
        const out = sandbox.doGet({ parameter: { accion: 'ping' } });
        return { getResponseCode: () => 200, getContentText: () => out.getContent() };
      }
    },
    MailApp: { sendEmail: (m) => estado.correos.push(m) },
    DocumentApp: { openById: () => ({ getBody: () => ({ getText: () => 'Registro <<[UUID]>>' }) }) },
    Browser: { inputBox: () => { throw new Error('Browser.inputBox no disponible'); } }
  };
  vm.createContext(sandbox);
  const ejecutar = codigo => vm.runInContext(codigo, sandbox);

  return { sandbox, ejecutar, estado, DriveApp, SpreadsheetApp, Carpeta, carpetas, archivos, libros, props, cacheMap, nuevaCarpeta: (n) => new Carpeta(n, miUnidad.id) };
}

/** Carga Code.gs en un entorno nuevo. */
function cargarCodeGs(rutaCode, opts) {
  const env = crearEntorno(opts);
  const codigo = fs.readFileSync(rutaCode || path.join(__dirname, '..', '00_Config', 'Code.gs'), 'utf8');
  vm.runInContext(codigo, env.sandbox, { filename: 'Code.gs' });
  return env;
}

module.exports = { crearEntorno, cargarCodeGs };
