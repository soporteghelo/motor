/**
 * tools/apk_build.js
 * =========================================================================
 * Compila el APK de Android sin exigir que java ni el SDK estén en el PATH:
 * los busca donde Android Studio los deja normalmente.
 *
 *   npm run apk              APK de depuración (para instalar y probar)
 *   npm run apk -- --release APK de release (necesita firma, ver abajo)
 *
 * FIRMA
 *   El APK de depuración lo firma Gradle con una clave de prueba: sirve para
 *   instalarlo a mano, no para distribuirlo. Para el que entregas al cliente
 *   hace falta tu propio almacén de claves y, en android/keystore.properties:
 *
 *     storeFile=C:/ruta/motor.keystore
 *     storePassword=...
 *     keyAlias=motor
 *     keyPassword=...
 *
 *   Ese archivo NO se versiona (está en .gitignore). Si lo pierdes, no podrás
 *   publicar una actualización del APK sobre las instalaciones existentes:
 *   guárdalo con la misma seriedad que una contraseña de producción.
 * =========================================================================
 */
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT    = path.join(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const SALIDA  = path.join(ROOT, '.apk');

const release = process.argv.includes('--release');
const morir = (msg, ayuda) => {
  console.error('❌ ' + msg);
  if (ayuda) console.error('\n' + ayuda);
  process.exit(1);
};

if (!fs.existsSync(ANDROID)) morir('No existe android/. Ejecuta: npx cap add android');

// ── 1. JDK ────────────────────────────────────────────────────────────────
// Gradle necesita un JDK 21. Android Studio trae uno embebido (jbr).
function buscarJdk() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const candidatos = [
    'C:/Program Files/Android/Android Studio/jbr',
    'C:/Program Files/Android/Android Studio1/jbr',
    path.join(os.homedir(), 'AppData/Local/Programs/Android Studio/jbr'),
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    path.join(os.homedir(), '.jdks')
  ];
  for (const c of candidatos) {
    const java = path.join(c, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (fs.existsSync(java)) return c;
  }
  // Último recurso: algún JDK suelto en Program Files
  const pf = 'C:/Program Files/Java';
  if (fs.existsSync(pf)) {
    for (const d of fs.readdirSync(pf)) {
      if (fs.existsSync(path.join(pf, d, 'bin', 'java.exe'))) return path.join(pf, d);
    }
  }
  return '';
}

// ── 2. SDK de Android ─────────────────────────────────────────────────────
function buscarSdk() {
  for (const v of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) {
    if (v && fs.existsSync(v)) return v;
  }
  const candidatos = [
    path.join(process.env.LOCALAPPDATA || '', 'Android/Sdk'),
    path.join(os.homedir(), 'AppData/Local/Android/Sdk'),
    path.join(os.homedir(), 'Library/Android/sdk'),
    path.join(os.homedir(), 'Android/Sdk')
  ];
  for (const c of candidatos) if (c && fs.existsSync(path.join(c, 'platform-tools'))) return c;
  return '';
}

const JDK = buscarJdk();
if (!JDK) {
  morir('No encontré un JDK.',
        'Instala Android Studio (trae el suyo) o define JAVA_HOME apuntando a un JDK 21.');
}
const SDK = buscarSdk();
if (!SDK) {
  morir('No encontré el SDK de Android.',
        'Instálalo desde Android Studio (Tools → SDK Manager) o define ANDROID_HOME.');
}
console.log('☕ JDK ' + JDK);
console.log('🤖 SDK ' + SDK);

// ── 3. local.properties (Gradle lee de aquí dónde está el SDK) ────────────
// Barras hacia adelante: en un .properties la barra invertida escapa.
const local = path.join(ANDROID, 'local.properties');
const deseado = 'sdk.dir=' + SDK.replace(/\\/g, '/') + '\n';
if (!fs.existsSync(local) || fs.readFileSync(local, 'utf8') !== deseado) {
  fs.writeFileSync(local, deseado);
  console.log('📝 android/local.properties actualizado');
}

// ── 3b. Permisos del manifiesto ───────────────────────────────────────────
/**
 * `android/` NO se versiona: lo regenera `npx cap add android`. Cualquier
 * ajuste nativo se vuelve a aplicar aquí, de forma idempotente, para que no
 * se pierda al regenerarlo.
 *
 * CAMERA la necesita Face_Capture, que usa getUserMedia: Capacitor pide el
 * permiso en caliente, pero Android no concede uno que no esté declarado, así
 * que sin esta línea la captura de rostro falla dentro del APK.
 *
 * uses-feature con required="false" es obligatorio al declarar CAMERA: si no,
 * Google Play da por hecho que la cámara es imprescindible y oculta la app a
 * los dispositivos que no la tengan.
 */
const manifiesto = path.join(ANDROID, 'app/src/main/AndroidManifest.xml');
if (fs.existsSync(manifiesto)) {
  let xml = fs.readFileSync(manifiesto, 'utf8');
  const lineas = [
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />'
  ].filter(l => !xml.includes(l));
  if (lineas.length) {
    const ancla = '<uses-permission android:name="android.permission.INTERNET" />';
    if (!xml.includes(ancla)) morir('No encontré el permiso INTERNET en AndroidManifest.xml.');
    xml = xml.replace(ancla, ancla + '\n    ' + lineas.join('\n    '));
    fs.writeFileSync(manifiesto, xml);
    console.log('📝 AndroidManifest.xml: +' + lineas.length + ' línea(s) (cámara)');
  }
}

// ── 3c. Icono del lanzador ────────────────────────────────────────────────
/**
 * Mismo motivo que el manifiesto: `android/` se regenera y trae el icono de
 * Capacitor. Los PNG salen de `python tools/gen_icons.py` (web/icons/android/)
 * y aquí se copian sobre `res/mipmap-*`. El fondo del icono adaptable va en el
 * azul marino del logo, el mismo de su lienzo, para que no se vea un borde.
 */
const iconosAndroid = path.join(ROOT, 'web/icons/android');
const resAndroid = path.join(ANDROID, 'app/src/main/res');
if (fs.existsSync(iconosAndroid) && fs.existsSync(resAndroid)) {
  let n = 0;
  for (const dens of fs.readdirSync(iconosAndroid)) {
    for (const f of fs.readdirSync(path.join(iconosAndroid, dens))) {
      const dst = path.join(resAndroid, dens, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(path.join(iconosAndroid, dens, f), dst);
      n++;
    }
  }
  const fondo = path.join(resAndroid, 'values/ic_launcher_background.xml');
  if (fs.existsSync(fondo)) {
    fs.writeFileSync(fondo, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n' +
      '    <color name="ic_launcher_background">#071B39</color>\n</resources>\n');
  }
  console.log('🖼️  Icono del lanzador: ' + n + ' archivo(s) aplicados');
}

// ── 4. Compilar ───────────────────────────────────────────────────────────
const gradlew = path.join(ANDROID, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
if (!fs.existsSync(gradlew)) morir('Falta ' + gradlew + '. Vuelve a ejecutar: npx cap add android');

const tarea = release ? 'assembleRelease' : 'assembleDebug';
console.log('\n🔨 gradle ' + tarea + ' (la primera vez descarga Gradle: puede tardar varios minutos)\n');
// En Windows, Node no ejecuta un .bat directamente: va a través de cmd.exe.
// El ejecutable y la ruta van como argumentos separados para que Node los
// entrecomille él (la ruta del proyecto tiene espacios).
const esWin = process.platform === 'win32';
const cmd   = esWin ? process.env.COMSPEC || 'cmd.exe' : gradlew;
const argv  = esWin ? ['/c', gradlew, tarea, '--console=plain'] : [tarea, '--console=plain'];
try {
  execFileSync(cmd, argv, {
    cwd: ANDROID,
    stdio: 'inherit',
    env: Object.assign({}, process.env, { JAVA_HOME: JDK, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK })
  });
} catch (e) {
  morir('Gradle falló (ver el detalle arriba).',
        'Causas habituales:\n' +
        '  · Falta la plataforma del SDK: ábrelo en Android Studio y acepta lo que pida.\n' +
        '  · Licencias sin aceptar: ' + SDK + '/cmdline-tools/latest/bin/sdkmanager --licenses\n' +
        (release ? '  · --release sin firma: crea android/keystore.properties (ver cabecera de este archivo).\n' : ''));
}

// ── 5. Recoger el APK ─────────────────────────────────────────────────────
const dir = path.join(ANDROID, 'app/build/outputs/apk', release ? 'release' : 'debug');
if (!fs.existsSync(dir)) morir('Gradle terminó pero no encuentro ' + dir);
const apk = fs.readdirSync(dir).find(f => f.endsWith('.apk'));
if (!apk) morir('No se generó ningún .apk en ' + dir);

fs.mkdirSync(SALIDA, { recursive: true });
let version = '';
try { version = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/ota-version.json'), 'utf8')).version; } catch (e) {}
const destino = path.join(SALIDA, 'MOTOR-SSOMA' + (version ? '-' + version : '') + (release ? '' : '-debug') + '.apk');
fs.copyFileSync(path.join(dir, apk), destino);

const mb = (fs.statSync(destino).size / 1048576).toFixed(1);
console.log('\n✅ APK listo (' + mb + ' MB)');
console.log('   ' + destino);
console.log('\nPara instalarlo en un teléfono conectado por USB:');
console.log('   "' + path.join(SDK, 'platform-tools/adb') + '" install -r "' + destino + '"');
if (!release) {
  console.log('\n⚠️  Es un APK de depuración, firmado con la clave de prueba de Gradle.');
  console.log('   Sirve para probar. Para entregarlo: npm run apk -- --release (con firma propia).');
}
