/**
 * tools/ota_zip.js
 * =========================================================================
 * Empaqueta una carpeta en un .zip. Sin dependencias: el proyecto no tiene
 * ninguna y esto no justifica la primera.
 *
 * Solo escribe lo que necesita el OTA: ZIP clásico (sin ZIP64, sin cifrado),
 * método deflate, rutas con "/" y entradas de archivo (no de carpeta: todo
 * descompresor crea las carpetas que haga falta).
 *
 *   const { zipCarpeta } = require('./ota_zip');
 *   zipCarpeta('dist', 'bundle.zip');
 * =========================================================================
 */
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

/** CRC-32 (el que exige el formato ZIP). Node 20.12+ lo trae nativo. */
const crc32 = (() => {
  if (typeof zlib.crc32 === 'function') return buf => zlib.crc32(buf) >>> 0;
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    tabla[n] = c;
  }
  return buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = tabla[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

/** Fecha/hora en el formato MS-DOS que usa el ZIP (resolución: 2 segundos). */
function selloDos(fecha) {
  const a = Math.max(1980, fecha.getFullYear());
  return {
    hora: (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1),
    dia:  ((a - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate()
  };
}

/** Lista recursiva de archivos, con su ruta relativa en formato ZIP. */
function listar(base, rel = '') {
  const out = [];
  for (const nombre of fs.readdirSync(path.join(base, rel)).sort()) {
    const r = rel ? rel + '/' + nombre : nombre;
    const st = fs.statSync(path.join(base, r));
    if (st.isDirectory()) out.push(...listar(base, r));
    else if (st.isFile()) out.push({ ruta: r, tam: st.size, fecha: st.mtime });
  }
  return out;
}

/**
 * Comprime `carpeta` en `destino`. Devuelve { archivos, bytes }.
 * Las entradas van en orden alfabético y con fecha fija si se pasa `fecha`,
 * para que dos builds idénticos produzcan el MISMO zip (y el mismo SHA-256).
 */
function zipCarpeta(carpeta, destino, fecha) {
  const archivos = listar(carpeta);
  if (!archivos.length) throw new Error('La carpeta ' + carpeta + ' está vacía: nada que empaquetar.');

  const locales = [];
  const central = [];
  let offset = 0;

  for (const a of archivos) {
    const nombre = Buffer.from(a.ruta, 'utf8');
    const crudo  = fs.readFileSync(path.join(carpeta, a.ruta));
    const crc    = crc32(crudo);
    // Si deflate no reduce el tamaño (p. ej. un PNG), se guarda sin comprimir.
    const comp   = zlib.deflateRawSync(crudo, { level: 9 });
    const usaDeflate = comp.length < crudo.length;
    const datos  = usaDeflate ? comp : crudo;
    const metodo = usaDeflate ? 8 : 0;
    const { hora, dia } = selloDos(fecha || a.fecha);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);   // firma de cabecera local
    lh.writeUInt16LE(20, 4);           // versión necesaria (2.0)
    lh.writeUInt16LE(0, 6);            // sin banderas (nombres en UTF-8 abajo)
    lh.writeUInt16LE(metodo, 8);
    lh.writeUInt16LE(hora, 10);
    lh.writeUInt16LE(dia, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(datos.length, 18);
    lh.writeUInt32LE(crudo.length, 22);
    lh.writeUInt16LE(nombre.length, 26);
    lh.writeUInt16LE(0, 28);
    locales.push(lh, nombre, datos);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);   // firma de directorio central
    cd.writeUInt16LE(20, 4);           // versión que lo creó
    cd.writeUInt16LE(20, 6);           // versión necesaria
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(metodo, 10);
    cd.writeUInt16LE(hora, 12);
    cd.writeUInt16LE(dia, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(datos.length, 20);
    cd.writeUInt32LE(crudo.length, 24);
    cd.writeUInt16LE(nombre.length, 28);
    cd.writeUInt16LE(0, 30);           // extra
    cd.writeUInt16LE(0, 32);           // comentario
    cd.writeUInt16LE(0, 34);           // disco
    cd.writeUInt16LE(0, 36);           // atributos internos
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38); // permisos unix (rw-r--r--)
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nombre);

    offset += lh.length + nombre.length + datos.length;
  }

  const cuerpo = Buffer.concat(locales);
  const dir    = Buffer.concat(central);
  const fin    = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);    // firma de fin de directorio
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(dir.length, 12);
  fin.writeUInt32LE(cuerpo.length, 16);
  fin.writeUInt16LE(0, 20);

  const zip = Buffer.concat([cuerpo, dir, fin]);
  fs.writeFileSync(destino, zip);
  return { archivos: archivos.length, bytes: zip.length };
}

module.exports = { zipCarpeta, crc32 };
