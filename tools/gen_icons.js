/**
 * gen_icons.js — genera web/icons/icon-192.png e icon-512.png
 *
 *   node tools/gen_icons.js
 *
 * Mismo diseño que web/icons/icon.svg (escudo con check), rasterizado sin
 * dependencias: iOS no acepta SVG como apple-touch-icon y el manifest pide
 * PNG para instalar la app. Solo hace falta re-ejecutarlo si cambia el diseño.
 */
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const FONDO = [0x1a, 0x23, 0x7e];
const BLANCO = [255, 255, 255];

// Contorno del escudo en coordenadas 0..512 (curvas muestreadas)
function escudo() {
  const pts = [[256, 104], [376, 150], [376, 252]];
  const bez = (p0, p1, p2, p3, n) => {
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
                u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]);
    }
  };
  bez([376, 252], [376, 330], [324, 384], [256, 410], 24);
  bez([256, 410], [188, 384], [136, 330], [136, 252], 24);
  pts.push([136, 150]);
  return pts;
}
const POLI = escudo();

function dentro(x, y) {
  let c = false;
  for (let i = 0, j = POLI.length - 1; i < POLI.length; j = i++) {
    const [xi, yi] = POLI[i], [xj, yj] = POLI[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
const enCheck = (x, y) => Math.min(distSeg(x, y, 206, 258, 242, 294), distSeg(x, y, 242, 294, 310, 222)) <= 15;

function color(x, y) {
  if (!dentro(x, y)) return FONDO;
  return enCheck(x, y) ? FONDO : BLANCO;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(tipo, datos) {
  const len = Buffer.alloc(4); len.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(tam) {
  const S = 3; // supermuestreo 3x3 para bordes suaves
  const filas = [];
  for (let y = 0; y < tam; y++) {
    const fila = Buffer.alloc(1 + tam * 3);
    for (let x = 0; x < tam; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const c = color((x + (sx + 0.5) / S) * 512 / tam, (y + (sy + 0.5) / S) * 512 / tam);
        r += c[0]; g += c[1]; b += c[2];
      }
      fila[1 + x * 3] = Math.round(r / (S * S));
      fila[2 + x * 3] = Math.round(g / (S * S));
      fila[3 + x * 3] = Math.round(b / (S * S));
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // RGB 8 bits
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(filas), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const destino = path.join(__dirname, '..', 'web', 'icons');
fs.mkdirSync(destino, { recursive: true });
[192, 512].forEach(t => {
  fs.writeFileSync(path.join(destino, 'icon-' + t + '.png'), png(t));
  console.log('✅ web/icons/icon-' + t + '.png');
});
