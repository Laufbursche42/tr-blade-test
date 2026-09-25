// Laufbursche Blade test: connect to a scooter over Web Bluetooth, write the VCU
// identity, the string the app calls the FIN and the Bluetooth module advertises as
// its name, and ask single assemblies whether they answer behind that link.
//
// Nothing here looks at the model. The chooser lists devices whose name starts with
// TDE or T1DE and the write goes to whatever accepted the link, which is the point
// of this tool.
//
// The frame is a byte-for-byte port of CommandBuilder.setDeviceName in the Laufbursche
// Edition app: AA 1F, then 16 ASCII name bytes, then one 0xFF, then CRC-8.

'use strict';

const BUILD = 'v28';

// Candidate GATT services the Teverun Bluetooth module exposes. The ISSC transparent
// UART is the usual one; cheap modules use a 16-bit UUID from the vendor range, so the
// whole 0xFC00 to 0xFFFF block is declared. Web Bluetooth only lets a page touch a
// service it named up front.
const ISSC_SERVICE = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
// The write characteristic the app hardcodes for this service (app-service.js:3303).
const ISSC_WRITE = '49535343-aca3-481c-91ec-d85e28a60318';
const NORDIC_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const VENDOR_16BIT = [];
for (const base of ['fc', 'fd', 'fe', 'ff']) {
  for (let i = 0; i < 256; i++) {
    VENDOR_16BIT.push('0000' + base + i.toString(16).padStart(2, '0') + '-0000-1000-8000-00805f9b34fb');
  }
}
// The standard device information service. A module that fills it names itself.
const DIS_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb';
const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
const OPTIONAL_SERVICES = [ISSC_SERVICE, NORDIC_SERVICE, DIS_SERVICE, BATTERY_SERVICE]
  .concat(VENDOR_16BIT);

// The advertised name is the identity: TDE... is the limited one, anything else is
// an identity whose first three characters no longer read TDE. TEU is in the list
// because a rider typed it and a tool that cannot see a scooter cannot fix it.
// Matched against the START of the advertised name, so TDE also covers TDE1, TEU covers
// TEU1 and T1 covers T1DE. Longer forms need no entry of their own.
const NAME_PREFIXES = ['TDE', 'T1', 'TEU'];

const CONNECT_CODE_INTERVAL_MS = 6500;   // the app's keep-alive spacing
const WRITE_GAP_MS = 200;                // the app's spacing between two frames
const LS_ORIG = 'fintest_orig_name';
const LS_THEME = 'fintest_theme';

let device = null;
let deviceId = '';     // raw BLE device id, redacted out of the public log
let writeChar = null;
let writeUuid = null;
let writeChars = [];   // every writable characteristic, not just the chosen one
let notifyUuids = [];
let rxCount = 0;        // everything heard since connect, telemetry included
let rxLastUuid = null;  // which channel last delivered, so a silent probe is explainable
let keepAlive = null;
let connectCounter = 0;
let originalName = null;
let busy = Promise.resolve();

const $ = id => document.getElementById(id);

// Binding through this means one missing element costs that one control, not the whole
// startup. An unguarded binding on a null threw and everything after it never ran, so
// the page looked alive and did nothing.
function on(id, ev, fn) {
  const el = $(id);
  if (el) el.addEventListener(ev, fn);
  return !!el;
}

// Every element this script writes to. A page that is older than the script is missing
// some of them, and then a card silently never appears. Checked once at startup so the
// answer is a named list instead of a null somewhere deep in a handler.
const REQUIRED_IDS = ['status', 'log', 'frame', 'build-ver', 'dev-name', 'svc-name',
  'fin-in', 'btn-conn', 'btn-set', 'btn-restore', 'btn-forget', 'orig-name',
  'prof-out', 'btn-prof-copy', 'inv-out', 'btn-inv-copy',
  'btn-unlock-auto', 'btn-unlock-man', 'btn-lock', 'btn-req-info',
  'probe-node', 'btn-probe', 'btn-probe-all', 'btn-probe-copy', 'probe-out',
  'public-log', 'diag-log', 'btn-copy-log', 'btn-clear-log', 'btn-save-log', 'btn-theme'];

// ── theme (dark default; light switched in by data-theme on <html>) ───────────
// applyTheme sets data-theme, swaps the button glyph (sun in dark, moon in light) and its
// label via t(), then persists the choice. Stored theme wins; otherwise dark is the default.
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const b = $('btn-theme');
  if (b) { b.innerHTML = dark ? '&#9728;' : '&#9790;'; b.setAttribute('aria-label', t(dark ? 'themeToLight' : 'themeToDark')); b.title = b.getAttribute('aria-label'); }   // scan-ok: a fixed character, not user input
  try { localStorage.setItem(LS_THEME, dark ? 'dark' : 'light'); } catch (e) {}
}
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(LS_THEME); } catch (e) {}
  applyTheme(saved !== 'light');
  const b = $('btn-theme');
  if (b) b.addEventListener('click', () => { applyTheme(document.documentElement.getAttribute('data-theme') === 'light'); });
}

// ── log panel (lb-tool-web model) ────────────────────────────────────────────
// Timestamped, appended newest-at-bottom with autoscroll, coloured TX/RX/ok/err, buffered so a
// re-render (the Public Log toggle) can rebuild it. Copy / clear / save all use the same redacted
// text. The transcript is technical English/ASCII, independent of the German UI.
let logBuffer = [];
let publicLog = true;    // anonymize the log (default on; toggled by the Public Log checkbox)
let diagLog = false;     // verbose: keep-alive TX and every telemetry RX frame

// Wrap a value that should be masked in the public log (FIN / advertised name / device id).
function sens(s) { return '\x01' + String(s) + '\x01'; }

function redact(text) {
  let s = String(text);
  if (deviceId) s = s.split(deviceId).join('[redacted-id]');
  s = s.replace(/\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, '[redacted-mac]');
  s = s.replace(/\b(secret|token|key|aes|pwd|password|pin|mac|serial|vin|uid|imei)\b(\s*[:=]\s*)("?)([^\s",]+)\3/gi,
    function (m, k, sep) { return k + sep + '[redacted]'; });
  s = s.replace(/\b[0-9A-Fa-f]{16,}\b/g, '[redacted-hex]');
  return s;
}
// Public log on = mask the driver-marked spans (\x01..\x01, e.g. FIN) and run redaction. Off = the
// full raw line (local debugging only, do not share).
function anonymize(s) {
  if (publicLog === false) return s.replace(/\x01/g, '');
  return redact(s.replace(/\x01[^\x01]*\x01/g, 'XX').replace(/\x01/g, ''));
}
// Survives a page missing the element, so a mismatch can still be reported instead of throwing
// while trying to report itself.
function log(msg, cls) {
  const ts = new Date().toISOString().slice(11, 19);
  const raw = '[' + ts + '] ' + msg;
  logBuffer.push({ raw: raw, cls: cls || '' });
  const pre = $('log');
  if (pre) {
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = anonymize(raw) + '\n';
    pre.appendChild(span);
    pre.scrollTop = pre.scrollHeight;
  } else {
    console.log(anonymize(raw));
  }
}
function renderLog() {
  const pre = $('log'); if (!pre) return;
  pre.textContent = '';
  logBuffer.forEach(function (e) {
    const span = document.createElement('span');
    if (e.cls) span.className = e.cls;
    span.textContent = anonymize(e.raw) + '\n';
    pre.appendChild(span);
  });
  pre.scrollTop = pre.scrollHeight;
}
function clearLog() { logBuffer = []; const pre = $('log'); if (pre) pre.textContent = ''; log('log cleared'); }
function copyLog() {
  const text = logBuffer.map(function (e) { return anonymize(e.raw); }).join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { log('log copied to clipboard', 'log-ok'); },
      function () { log('clipboard write failed', 'log-err'); });
  } else { log('clipboard API unavailable', 'log-err'); }
}
function saveLog() {
  const text = logBuffer.map(function (e) { return anonymize(e.raw); }).join('\n');
  try {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'laufbursche42-blade-test-log.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    log('log saved', 'log-ok');
  } catch (e) { log('save failed: ' + (e && e.message ? e.message : e), 'log-err'); }
}

function setStatus(state, key) {
  const el = $('status');
  if (!el) return;
  el.dataset.state = state;
  el.setAttribute('data-t', key);   // a language switch re-localizes the status via applyLang
  el.textContent = t(key);
}

// ── CRC-8, poly 0x07, the exact port ─────────────────────────────────────────
function crc8(bytes, len) {
  let crc = 0;
  for (let i = 0; i < len; i++) {
    crc ^= bytes[i] & 0xFF;
    for (let n = 8; n > 0; n--) {
      crc = ((crc & 0x80) !== 0) ? (((crc << 1) ^ 0x07) & 0x1FF) : ((crc << 1) & 0x1FF);
    }
    crc &= 0xFF;
  }
  return crc & 0xFF;
}

function finalizeFrame(a19) {
  const out = new Uint8Array(20);
  for (let i = 0; i < 19; i++) out[i] = a19[i] & 0xFF;
  out[19] = crc8(a19, 19);
  return out;
}

function base(cmdId) {
  const a = new Array(19).fill(0xFF);
  a[0] = 0xAA;
  a[1] = cmdId & 0xFF;
  return a;
}

// Handshake and keep-alive: AA 01 10 <counter> FF..FF CRC.
function connectCode(counter) {
  const a = base(0x01);
  a[2] = 0x10;
  a[3] = counter & 0xFF;
  return finalizeFrame(a);
}

// cmd 0x1F: the 16 name bytes go into a[2..17], space-padded. a[18] stays 0xFF,
// because the handler reads only those 16.
function setDeviceNameFrame(name) {
  const a = base(0x1F);
  const ascii = [];
  for (const ch of String(name)) {
    const c = ch.charCodeAt(0);
    if (c >= 0x20 && c <= 0x7E) ascii.push(c);   // non-ASCII is dropped, as in the app
  }
  for (let i = 0; i < 16; i++) a[2 + i] = (i < ascii.length) ? ascii[i] : 0x20;
  return finalizeFrame(a);
}

function hex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

// One notification can carry several 20-byte frames back to back. The app cuts them
// apart the same way (app-service.js:11097). The checksum cannot catch a missed split:
// CRC-8 over a valid frame including its own check byte is zero, so any run of valid
// frames validates as one oversized frame.
function splitFrames(v) {
  if (v.length <= 20) return [v];
  const out = [];
  for (let i = 0; i < v.length; i += 20) out.push(v.subarray(i, i + 20));
  return out;
}

// ── settings state + cruise (Tempomat) command ───────────────────────────────
// The eKFV clamp lever in the native Teverun app (v2.0.5, uni.UNI2202FAB) is the cruise
// mode carried in the 0x18 settings frame. To flip ONLY cruise without disturbing anything
// else, the whole controller state is mirrored from the last 55 71 and only S.cruise changes.
// This is a byte-for-byte port of the app's sendSettingCode / the 55 71 parse.

function bytesToInt(bitsArr) {           // LSB-first: index 0 = bit0
  let x = 0;
  for (let i = 0; i < bitsArr.length; i++) if (bitsArr[i] & 1) x |= (1 << i);
  return x & 0xFF;
}
function bytesToInt2(bitsArr) {          // MSB-first: index 0 = most-significant bit
  let x = 0; const n = bitsArr.length;
  for (let i = 0; i < n; i++) if (bitsArr[i] & 1) x |= (1 << (n - 1 - i));
  return x & 0xFF;
}
function nibbles(high, low) {
  const b = new Array(8).fill(0);
  for (let k = 0; k < 4; k++) b[k] = (high >> (3 - k)) & 1;
  for (let k = 0; k < 4; k++) b[4 + k] = (low >> (3 - k)) & 1;
  return b;
}
function applyCruise(bitsArr, cruise) {  // 2 -> bit2; 1 -> bit0 & bit1; 0 -> none
  if (cruise === 2) bitsArr[2] = 1;
  else if (cruise === 1) { bitsArr[0] = 1; bitsArr[1] = 1; }
}
function voltCode(pv) {
  switch (pv) {
    case 36: return 30; case 48: return 39; case 52: return 42;
    case 60: return 48; case 72: return 60; case 84: return 69;
    default: return pv & 0xFF;
  }
}

const S = {
  gear: 1, wheel: 8.5, sysProTemp: 80, motorPolePairs: 15,
  assistSpeedLimit: 25, speedLimit: 25, fCurrent: 0, rCurrent: 0, packVolt: 60,
  enfEcon: false, isUnitMile: false, atMode: false, isSmart: false,
  cruise: 0, abs: false, startMode: false,
  fStartLevel: 0, rStartLevel: 0, eabsLevel: 0, sleepTime: 0, prTime: 0,
  rmStatus: 1, doubleMotor: 1, systemStatus6: 0, received71: false,
};

function updateFrom71(t) {
  S.gear = t[3] & 0xFF;
  const r = t[4] & 0xFF;
  S.cruise = (((r >> 2) & 1) << 1) | ((r >> 1) & 1);
  S.abs = ((r >> 3) & 1) !== 0;
  S.startMode = ((r >> 6) & 1) !== 0;
  S.motorPolePairs = t[5] & 0xFF;
  S.wheel = (t[6] & 0xFF) * 0.1;
  S.sysProTemp = t[7] & 0xFF;
  S.fStartLevel = t[8] & 0x0F;
  S.eabsLevel = (t[9] >> 4) & 0x0F;
  S.rStartLevel = t[9] & 0x0F;
  S.assistSpeedLimit = t[10] & 0xFF;
  S.speedLimit = t[11] & 0xFF;
  S.fCurrent = t[12] & 0xFF;
  S.rCurrent = t[13] & 0xFF;
  S.packVolt = t[15] & 0xFF;
  const sys = t[17] & 0xFF;
  S.enfEcon = (sys & 0x01) !== 0;
  S.isUnitMile = (sys & 0x02) !== 0;
  S.atMode = (sys & 0x04) !== 0;
  S.isSmart = (sys & 0x10) !== 0;
  S.systemStatus6 = (sys >> 6) & 1;
  const sp = t[18] & 0xFF;
  S.sleepTime = sp & 0x07;
  S.prTime = (sp >> 3) & 0x1F;
  S.received71 = true;
}

function buildSettingFrame() {
  const a = new Array(19).fill(0xFF);
  a[0] = 0xAA; a[1] = 24; a[2] = 2; a[3] = S.gear & 0xFF;
  const s4 = new Array(8).fill(0);
  applyCruise(s4, S.cruise); s4[3] = S.abs ? 1 : 0; s4[6] = S.startMode ? 1 : 0; s4[7] = S.rmStatus & 1;
  a[4] = bytesToInt(s4);
  a[5] = S.motorPolePairs & 0xFF;
  a[6] = Math.round(S.wheel * 10.0) & 0xFF;
  a[7] = S.sysProTemp & 0xFF;
  a[8] = bytesToInt2(nibbles(S.eabsLevel, S.fStartLevel));
  a[9] = bytesToInt2(nibbles(S.eabsLevel, S.rStartLevel));
  a[10] = S.assistSpeedLimit & 0xFF;
  a[11] = S.speedLimit & 0xFF;
  a[12] = S.fCurrent & 0xFF;
  a[13] = S.rCurrent & 0xFF;
  a[14] = voltCode(S.packVolt);
  a[15] = S.packVolt & 0xFF;
  const d = new Array(8).fill(0);
  d[0] = S.enfEcon ? 1 : 0; d[1] = S.isUnitMile ? 1 : 0; d[2] = S.atMode ? 1 : 0; d[4] = S.isSmart ? 1 : 0;
  a[16] = bytesToInt(d);
  const s17 = new Array(8).fill(0);
  applyCruise(s17, S.cruise); s17[3] = S.abs ? 1 : 0; s17[6] = S.startMode ? 1 : 0; s17[7] = S.doubleMotor & 1;
  a[17] = bytesToInt(s17);
  a[18] = ((S.prTime & 0x1F) << 3) | (S.sleepTime & 0x07);
  return finalizeFrame(a);
}

// Send the settings frame with a chosen cruise value. 1 = auto, 2 = manual (both lift the
// clamp in the native app), 0 = off. Everything else mirrors the last 55 71, so ONLY cruise
// changes. Needs a 55 71 first, otherwise the mirrored state would be defaults, not the scooter's.
function sendCruise(value) {
  if (!writeChar) { log('not connected', 'log-err'); return; }
  if (!S.received71) { log('waiting for 55 71 (settings) before sending', 'log-err'); return; }
  S.cruise = value;
  send(buildSettingFrame(), 'cruise=' + value + ' (0x18 settings frame)');
  log('sent cruise=' + value + '; now watch the live cam and the DIFF line in the inventory');
}

function refreshUnlockButtons() {
  const ok = !!writeChar && S.received71;
  ['btn-unlock-auto', 'btn-unlock-man', 'btn-lock'].forEach(id => {
    const el = $(id); if (el) el.disabled = !ok;
  });
  const ri = $('btn-req-info'); if (ri) ri.disabled = !writeChar;   // needs only a link, not 55 71
}

// The 55 44 / 55 45 / 55 4d assembly-identity frames (proType/proCode per node) do NOT stream on
// their own - they answer a request. We do not know the exact trigger byte from the app, so this
// probes the 0x01 info sub-commands (plus the app's AA 01 10 00 keep-alive form). The existing
// 0x44/0x45/0x4d decoders catch whatever comes back.
function infoReq(sub) { const a = base(0x01); a[2] = sub & 0xFF; return finalizeFrame(a); }
async function requestAssemblies() {
  if (!writeChar) { log('not connected', 'log-err'); return; }
  const c0 = base(0x01); c0[2] = 0x10; c0[3] = 0x00;   // AA 01 10 00 = the app keep-alive/connect form
  await send(finalizeFrame(c0), 'connect(0)');
  for (const s of [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x43, 0x44, 0x45, 0x4d]) {
    await send(infoReq(s), 'infoReq 0x' + s.toString(16).padStart(2, '0'));
  }
  log('assembly/version requests sent - watch the inventory for 55 44/45/4d, then copy it');
}

// Web Bluetooth rejects a write while another is in flight, so every write queues.
function send(bytes, what, viaChar) {
  busy = busy.then(async () => {
    const ch = viaChar || writeChar;
    if (!ch) throw new Error('no write characteristic');
    await ch.writeValue(bytes);
    if (what) { log('TX ' + what + '  ' + hex(bytes), 'log-tx'); $('frame').textContent = hex(bytes); }
    else if (diagLog) log('TX ' + hex(bytes), 'log-tx');   // keep-alive / resend: verbose only
    await new Promise(r => setTimeout(r, WRITE_GAP_MS));
  }).catch(e => { log('write failed: ' + (e && e.message ? e.message : e), 'log-err'); });
  return busy;
}

// ── Device profile ───────────────────────────────────────────────────────────
// Every service and characteristic the module offers, plus the contents of the
// standard device information service. Reading is limited to that one service:
// a read on an unknown vendor characteristic can have side effects, a read on
// 180A cannot, it exists to be read.

// Values are i18n keys, resolved with t() at render time so a language switch takes effect.
const DIS_NAMES = {
  '2a23': 'disSysId',
  '2a24': 'disModel',
  '2a25': 'disSerial',
  '2a26': 'disFirmware',
  '2a27': 'disHardware',
  '2a28': 'disSoftware',
  '2a29': 'disManuf',
  '2a2a': 'disRegdata',
  '2a50': 'disPnp',
};

const short = uuid => (uuid.startsWith('0000') && uuid.endsWith('-0000-1000-8000-00805f9b34fb'))
  ? uuid.slice(4, 8) : uuid;

function charProps(c) {
  const p = c.properties, out = [];
  if (p.read) out.push(t('cpRead'));
  if (p.write) out.push(t('cpWrite'));
  if (p.writeWithoutResponse) out.push(t('cpWriteNoResp'));
  if (p.notify) out.push(t('cpNotify'));
  if (p.indicate) out.push(t('cpIndicate'));
  if (p.broadcast) out.push(t('cpBroadcast'));
  if (p.authenticatedSignedWrites) out.push(t('cpSigned'));
  return out.length ? out.join(', ') : t('lblNone');
}

function dvText(dv) {
  let s = '';
  for (let i = 0; i < dv.byteLength; i++) {
    const c = dv.getUint8(i);
    if (c >= 0x20 && c <= 0x7E) s += String.fromCharCode(c);
  }
  return s.trim();
}

// Vendor and product straight out of the module, if it fills this one in.
function pnpText(dv) {
  if (dv.byteLength < 7) return null;
  const src = dv.getUint8(0);
  return t('pnpSource') + ' ' + (src === 1 ? 'Bluetooth SIG' : src === 2 ? 'USB-IF' : src)
       + ', ' + t('pnpVendor') + ' 0x' + dv.getUint16(1, true).toString(16).padStart(4, '0')
       + ', ' + t('pnpProduct') + ' 0x' + dv.getUint16(3, true).toString(16).padStart(4, '0')
       + ', ' + t('pnpRevision') + ' 0x' + dv.getUint16(5, true).toString(16).padStart(4, '0');
}

async function buildProfile(services) {
  if (!$('prof-out')) { log('device-profile card missing from this page, see above', 'log-err'); return; }
  const lines = [];
  lines.push(t('profDumpTitle') + '  Build ' + BUILD);
  lines.push('FIN:'.padEnd(10) + ((device && device.name) || '-'));
  lines.push((t('profServices') + ':').padEnd(10) + services.length);
  for (const svc of services) {
    lines.push('');
    lines.push(t('profService') + ' ' + short(svc.uuid));
    let chars;
    try { chars = await svc.getCharacteristics(); } catch (e) { chars = []; }
    if (!chars.length) { lines.push('  ' + t('profNoChars')); continue; }
    for (const c of chars) {
      lines.push('  ' + short(c.uuid) + '   ' + charProps(c));
      if (svc.uuid !== DIS_SERVICE || !c.properties.read) continue;
      const key = short(c.uuid);
      let val;
      try {
        const dv = await c.readValue();
        val = (key === '2a50' ? pnpText(dv) : null) || dvText(dv) || hex(new Uint8Array(dv.buffer));
      } catch (e) {
        // Web Bluetooth refuses the serial number by design, that is not a fault.
        val = '(' + t('profNotReadable') + ': ' + (e && e.name ? e.name : e) + ')';
      }
      lines.push('      ' + (t(DIS_NAMES[key]) || key) + ': ' + val);
    }
  }
  $('prof-out').textContent = lines.join('\n');
  $('btn-prof-copy').disabled = false;
}

// ── Inventory ────────────────────────────────────────────────────────────────
// Nothing is sent for this. The scooter streams 55 frames on its own and a few of
// them carry the identity of every assembly it knows about. The app reads them at
// app-service.js:11102 to :11229; this is the same read, nothing more.
//
// Four version bytes all FF means "not reported" and the app prints -.-.- for it.
// The light module is the odd one out: the app tests three bytes there, not four,
// so each field checks exactly what the app checks.

// label holds an i18n key, resolved with t() at render time.
const INVENTORY = {
  0x44: [
    { key: 'dis', label: 'invDisplay',      type: 2,  code: 3,  ver: 4,  test: 4 },
    { key: 'bat', label: 'invBattery',      type: 8,  code: 9,  ver: 10, test: 4 },
    { key: 'lc',  label: 'invLightModule',  type: 14, code: 15, ver: 16, test: 3 },
  ],
  0x45: [
    { key: 'rm',  label: 'invCtrlRear',     type: 2,  code: 3,  ver: 4,  test: 4 },
    { key: 'fm',  label: 'invCtrlFront',    type: 8,  code: 9,  ver: 10, test: 4 },
  ],
  0x4D: [
    { key: 'rr',  label: 'invCtrlRearRight',  type: 2, code: 3, ver: 4,  test: 4 },
    { key: 'rf',  label: 'invCtrlFrontRight', type: 8, code: 9, ver: 10, test: 4 },
  ],
};

// Field readings for the frames the app decodes. Everything else still shows up raw,
// so an unknown frame is visible instead of silently dropped.
const u16 = (v, i) => (v[i] << 8) | v[i + 1];
const bits = b => b.toString(2).padStart(8, '0').split('').reverse();   // the app's order

// The identity frames read their fields straight out of INVENTORY, so the raw view and
// the summary above can never drift apart.
function invFields(sub) {
  return v => INVENTORY[sub].map(f => [t(f.label),
    t('lblType') + ' ' + v[f.type] + '  Code ' + v[f.code]
    + '  Version ' + (invVersion(v, f.ver, f.test) || t('invNotReported'))]);
}

// Field labels come from t() at call time (renderInventory invokes the decoder); units and
// raw hex stay literal.
const DECODERS = {
  0x41: v => [[t('dAkkuText'), invAscii(v, 2, 15) || t('dNothingPrintable')]],
  0x42: v => [[t('dFrameNoText'), invAscii(v, 2, 17) || t('dNothingPrintable')]],
  0x43: v => [['Software', v[2] + '.' + v[3] + '.' + v[4]],
              ['Hardware', v[6] + '.' + v[7] + '.' + v[8]],
              // The app logs byte 17 as "gearMode" and splits its two nibbles into a
              // gear range, but only applies that on ECU devices (app-service.js:37926).
              [t('dByte16to18'), hex([v[16], v[17], v[18]])],
              [t('dGearRange'), (v[17] & 15) + t('rangeTo') + ((v[17] >> 4) & 15)]],
  0x52: v => [[t('dPackVolt'), (0.1 * u16(v, 2)).toFixed(1) + ' V'],
              [t('dCellVolt'), (0.1 * u16(v, 4)).toFixed(1) + ' V'],
              [t('dCurrent'), (0.1 * u16(v, 6) - 1000).toFixed(1) + ' A'],
              [t('dCharge'), v[8] + ' %'],
              [t('dHealth'), v[9] + ' %'],
              // The app reads seven sensors out of 10 to 16, plus two more at 17 and 18.
              [t('dTemps'), [10, 11, 12, 13, 14, 15, 16, 17, 18]
                .map(i => v[i] - 40).join(' ') + ' C']],
  0x71: v => [[t('dGear'), String(v[3])],
              [t('dWheelSize'), (0.1 * v[6]).toFixed(1) + t('unitInch')],
              [t('dSpeedLimitB11'), String(v[11])],
              [t('dSpeedPerGearB10'), String(v[10])],
              [t('dCurrentFrontB12'), String(v[12])],
              [t('dCurrentRearB13'), String(v[13])],
              [t('dEabsFStartB8'), hex([v[8]]) + ' (' + ((v[8] >> 4) & 15) + '/' + (v[8] & 15) + ')'],
              [t('dEabsRStartB9'), hex([v[9]]) + ' (' + ((v[9] >> 4) & 15) + '/' + (v[9] & 15) + ')'],
              [t('dPolePairs'), String(v[5])],
              [t('dPackVolt'), String(v[15])],
              [t('dTemperature'), String(v[7])],
              [t('dCruise'), String(parseInt(bits(v[4])[2] + bits(v[4])[1], 2))],
              ['ABS', bits(v[4])[3]],
              [t('dStartMode'), bits(v[4])[6]],
              ['Smart', bits(v[17])[4]],
              [t('dMiles'), bits(v[17])[1]],
              // Candidates for the persistent eKFV lock state (the cruise value falls back to off
              // right away on the Blade, so the full status bytes plus their individual bits are shown here):
              [t('dByte4Ctrl'), hex([v[4]]) + '  bits ' + bits(v[4]).join('')],
              [t('dByte17Sys'), hex([v[17]]) + '  bits ' + bits(v[17]).join('')],
              [t('dEkfvClamp'), bits(v[17])[6]]],
  0x72: v => [[t('dCurrentRear'), (0.1 * u16(v, 12)).toFixed(1) + ' A'],
              [t('dCurrentFront'), (0.1 * u16(v, 4)).toFixed(1) + ' A'],
              [t('dMotorTempRear'), String(v[17])],
              [t('dMotorTempFront'), String(v[9])]],
  0x73: v => [[t('dAvg'), (0.1 * u16(v, 2)).toFixed(1) + ' km/h'],
              [t('dMax'), (0.1 * u16(v, 4)).toFixed(1) + ' km/h'],
              [t('dDistance'), (0.1 * u16(v, 6)).toFixed(1) + ' km']],
  0x44: invFields(0x44),
  0x45: invFields(0x45),
  0x4D: invFields(0x4D),
  // The BMS frames live in the app's battery page, not its home page.
  0x51: v => [[t('dCells1'), cells(v)]],
  0x55: v => [[t('dCells9'), cells(v)]],
  0x56: v => [[t('dCells17'), cells(v)]],
  0x53: v => [[t('dRelay'), v[2] + ' ' + v[3] + ' ' + v[4]],
              [t('dChargeMosfet'), v[5] === 2 ? t('dOn') : t('dOff') + ' (' + v[5] + ')'],
              [t('dDischargeMosfet'), v[6] === 2 ? t('dOn') : t('dOff') + ' (' + v[6] + ')'],
              [t('dBalancer'), bits(v[7]).join('')],
              [t('dCapacity'), u16(v, 8) + ' Ah'],
              [t('dCapacityV2'), u16(v, 10) + ' Ah'],
              [t('dChargeCycles'), String(u16(v, 12))],
              [t('dCellCount'), String(v[14])],
              [t('dCellHighest'), u16(v, 15) + ' mV'],
              [t('dCellLowest'), u16(v, 17) + ' mV']],
  0x54: v => {
    const on = [];
    for (let i = 2; i <= 18; i++) if (v[i] > 0) on.push(t('dField') + ' ' + (i - 2) + ' = ' + v[i]);
    return [[t('dWarnings'), on.length ? on.join(', ') : t('lblNone')]];
  },
};

function cells(v) {
  const out = [];
  for (let i = 2; i <= 16; i += 2) out.push(u16(v, i));
  return out.join(' ') + ' mV';
}

const INV_MAX_VARIANTS = 12;

let inv = {};
let invSeen = {};       // which 55 subtypes arrived and how often
let invVariants = {};   // sub -> { hexString: count }, because a subtype is not one frame
let invDropped = {};    // sub -> variants beyond the cap, so nothing vanishes unannounced

function resetInventory() {
  inv = { frameNo: null, batCode: null, mainSw: null, mainHw: null, parts: {} };
  invSeen = {};
  invVariants = {};
  invDropped = {};
}
resetInventory();

// A subtype can carry different content from one send to the next. Keeping only the
// last one hides exactly that, so every distinct byte pattern is counted separately.
function noteVariant(sub, v) {
  const key = hex(v);
  const m = invVariants[sub] || (invVariants[sub] = {});
  if (m[key] === undefined && Object.keys(m).length >= INV_MAX_VARIANTS) {
    invDropped[sub] = (invDropped[sub] || 0) + 1;
    return;
  }
  m[key] = (m[key] || 0) + 1;
}

function invAscii(v, from, len) {
  let s = '';
  for (let i = from; i < from + len && i < v.length; i++) {
    if (v[i] >= 0x20 && v[i] <= 0x7E) s += String.fromCharCode(v[i]);
  }
  return s.replace(/\s+/g, '');
}

// null means the assembly reported nothing, which is what the app shows as -.-.-
function invVersion(v, at, testLen) {
  let allFF = true;
  for (let i = at; i < at + testLen; i++) if (v[i] !== 0xFF) allFF = false;
  if (allFF) return null;
  return v[at] + '.' + v[at + 1] + '.' + v[at + 2];
}

function onInfoFrame(v) {
  if (v.length < 2) return;
  if (crc8(v, v.length - 1) !== v[v.length - 1]) return;   // the app checks this first
  const sub = v[1];
  invSeen[sub] = (invSeen[sub] || 0) + 1;
  noteVariant(sub, v);

  if (sub === 0x71) { updateFrom71(v); refreshUnlockButtons(); }

  if (sub === 0x41) {
    const c = invAscii(v, 2, 15);
    if (c) inv.batCode = c.startsWith('AW') ? c : 'AW' + c;
  } else if (sub === 0x42) {
    const f = invAscii(v, 2, 17);
    if (f) inv.frameNo = f;
  } else if (sub === 0x43) {
    if (v[2] > 0) inv.mainSw = v[2] + '.' + v[3] + '.' + v[4];
    if (v[6] > 0) inv.mainHw = v[6] + '.' + v[7] + '.' + v[8];
  } else if (INVENTORY[sub]) {
    for (const f of INVENTORY[sub]) {
      inv.parts[f.key] = {
        label: f.label,
        type: v[f.type],
        code: v[f.code],
        ver: invVersion(v, f.ver, f.test),
      };
    }
  }
  renderInventory();   // an unknown subtype still made it into the counter and the raw view
}

function renderInventory() {
  const lines = [];
  // Widen to a column but never cut a label short, a truncated name is unreadable.
  const pad = s => s.length >= 22 ? s + ' ' : (s + '                      ').slice(0, 22);
  lines.push(pad(t('invFrameNo') + ':') + (inv.frameNo || '-'));
  lines.push(pad(t('invBatCode') + ':') + (inv.batCode || '-'));
  lines.push(pad(t('invMainDevice') + ':') + 'Software ' + (inv.mainSw || '-')
             + '   Hardware ' + (inv.mainHw || '-'));
  lines.push('');
  const order = ['dis', 'bat', 'lc', 'rm', 'fm', 'rr', 'rf'];
  let any = false;
  for (const k of order) {
    const p = inv.parts[k];
    if (!p) continue;
    any = true;
    lines.push(pad(t(p.label) + ':') + (p.ver
      ? t('lblType') + ' ' + p.type + '  Code ' + p.code + '  Version ' + p.ver
      : t('invNotReported')));
  }
  if (!any) lines.push(t('invNoAssemblies'));
  const subs = Object.keys(invSeen).map(Number).sort((a, b) => a - b);
  if (subs.length) {
    lines.push('');
    lines.push(t('invSeenFrames') + ' ' + subs.map(s =>
      hex([s]) + ' x' + invSeen[s]).join(', '));
    lines.push('');
    lines.push(t('invFramesDetail'));
    for (const s of subs) {
      const variants = Object.keys(invVariants[s] || {});
      lines.push('');
      lines.push('55 ' + hex([s]) + '   ' + invSeen[s] + ' ' + t('invTimes') + ', '
                 + variants.length + ' ' + (variants.length === 1 ? t('invVariant') : t('invVariants'))
                 + (invDropped[s] ? ', ' + invDropped[s] + ' ' + t('invMoreNotKept') : ''));
      const dec = DECODERS[s];
      for (const raw of variants) {
        lines.push('  ' + t('invRaw') + '  ' + raw + '   (' + invVariants[s][raw] + 'x)');
        if (!dec) { lines.push('        ' + t('invAppNoDecode')); continue; }
        const bytes = raw.split(' ').map(h => parseInt(h, 16));
        let fields;
        try { fields = dec(bytes); } catch (e) { fields = null; }
        if (!fields) { lines.push('        ' + t('invDecodeFailed')); continue; }
        for (const f of fields) lines.push('        ' + pad(f[0] + ':') + f[1]);
      }
      // Byte diff across the variants: this is exactly where the persistent lock byte shows up.
      // When 55 71 streams twice, locked vs unlocked, this line shows the byte(s) that
      // differ - no matter whether it is the cruise value or something else.
      if (variants.length >= 2) {
        const rows = variants.map(r => r.split(' ').map(h => parseInt(h, 16)));
        const cols = Math.max(...rows.map(r => r.length));
        const diffs = [];
        for (let i = 0; i < cols; i++) {
          const vals = rows.map(r => r[i]);
          if (vals.some(x => x !== vals[0])) {
            diffs.push('B' + i + '=' + vals.map(x => (x === undefined ? '--' : hex([x]))).join('/'));
          }
        }
        lines.push('  ' + t('invDiff') + ' ' + (diffs.length ? diffs.join('  ') : t('lblNone')));
      }
    }
  }
  $('inv-out').textContent = lines.join('\n');
  $('btn-inv-copy').disabled = !subs.length;
}

// ── Node probe ───────────────────────────────────────────────────────────────
// A single question, no firmware. The original app's ver2 update path opens with a
// handshake that names the target node and the project code of the file. The node
// answers before anything is erased, and the START frame that would begin a flash is
// a separate command this page never builds. So the question is askable on its own.
//
// The project code is deliberately impossible, so even a node that is ready to be
// flashed can only answer "code does not match". Sources in the vendor app:
// frame build app-service.js:95023, checksum :95042, response :95333, nodes :46780.

const HANDSHAKE_ID = [0x06, 0xE2];
const PROBE_PROJECT_CODE = 0x00;
const PROBE_TIMEOUT_MS = 8000;
const PROBE_RESEND_MS = 3000;   // the app's resend spacing for an unanswered handshake

// id = the number the app's own picker carries, sent as that byte value. The display name
// comes from t('nodeName' + id) at render time; text is only an internal fallback.
const NODES = [
  { id: 50, text: 'TFT-40 display' },
  { id: 60, text: 'LCD-43 display' },
  { id: 70, text: 'Light module' },
  { id: 30, text: 'Rear controller' },
  { id: 31, text: 'Front controller' },
  { id: 10, text: 'BMS' },
];

let probeWaiting = null;   // { node, resolve, timer, sent }
let probeReport = [];

// BB + [06 e2 01 node code 00 00 00 00 sum] + crc8. The sum covers the seven payload
// bytes only, which are frame positions 2 to 8; the app sums before it prepends the ID.
function handshakeFrame(nodeId, projectCode) {
  const f = [HANDSHAKE_ID[0], HANDSHAKE_ID[1], 0x01, nodeId & 0xFF, projectCode & 0xFF, 0, 0, 0, 0, 0];
  let sum = 0;
  for (let i = 2; i < 9; i++) sum += f[i];
  f[9] = sum & 0xFF;
  const out = new Uint8Array(12);
  out[0] = 0xBB;
  for (let i = 0; i < 10; i++) out[1 + i] = f[i];
  out[11] = crc8(f, 10);
  return out;
}

// [titleKey, noteKey], resolved with t() when a response is decoded.
const PROBE_REASONS = {
  0x01: ['pr01Title', 'pr01Note'],
  0x02: ['pr02Title', 'pr02Note'],
  0x03: ['pr03Title', 'pr03Note'],
  0x04: ['pr04Title', 'pr04Note'],
};

// Returns null if this is not an answer to our question.
function decodeHandshakeResp(v) {
  if (v.length < 12 || v[0] !== 0xCC) return null;
  if (v[1] !== HANDSHAKE_ID[0] || v[2] !== 0xEA) return null;
  const body = [];
  for (let i = 1; i <= 10; i++) body.push(v[i]);
  if (crc8(body, 10) !== v[11]) return { title: t('hsRespDropped'), note: t('hsRespDroppedNote'), ok: false };
  if (v[3] === 0x01 && v[4] === 0xAA) {
    return { title: t('hsNodeAccept'), ok: true, note: t('hsNodeAcceptNote') };
  }
  if (v[3] === 0x01 && v[4] === 0x55) {
    const r = PROBE_REASONS[v[5]];
    if (r) return { title: t(r[0]), note: t(r[1]), ok: v[5] !== 0x01 };
    return { title: t('hsRejectedTitle') + hex([v[5]]), note: t('hsRejectedNote'), ok: false };
  }
  if (v[3] === 0x02 && v[4] === 0xA5) {
    return { title: t('hsConfirmNeeded'), ok: true, note: t('hsConfirmNeededNote') };
  }
  if (v[3] === 0x03) {
    return { title: t('hsProgress') + ' ' + hex([v[4], v[5]]), ok: true, note: t('hsProgressNote') };
  }
  return { title: t('hsUnknown'), note: t('hsUnknownNote'), ok: true };
}

// Called from the notify handler. True means the frame was ours.
function onProbeFrame(v, uuid) {
  if (!probeWaiting) return false;
  const res = decodeHandshakeResp(v);
  if (!res) return false;
  const w = probeWaiting;
  probeWaiting = null;
  clearTimeout(w.timer);
  w.resolve({ node: w.node, sent: w.sent, got: hex(v), via: uuid, res: res });
  return true;
}

async function probeNode(node, viaChar) {
  const frame = handshakeFrame(node.id, PROBE_PROJECT_CODE);
  const sent = hex(frame);
  const rxBefore = rxCount;
  log('probing node ' + node.id + ' (' + t('nodeName' + node.id) + ')');
  const answer = new Promise(resolve => {
    const timer = setTimeout(() => {
      probeWaiting = null;
      const heard = rxCount - rxBefore;
      resolve({ node: node, sent: sent, got: null, via: null,
                res: { title: t('hsNoAnswer'), ok: false,
                       note: heard
                         ? t('hsHeardPre') + heard + t('hsHeardPost')
                         : t('hsSilent') } });
    }, PROBE_TIMEOUT_MS);
    probeWaiting = { node: node, resolve: resolve, timer: timer, sent: sent };
  });
  await send(frame, 'node query', viaChar);
  // The app repeats an unanswered handshake after three seconds, so do the same once.
  const repeat = setTimeout(() => { if (probeWaiting) send(frame, null, viaChar); }, PROBE_RESEND_MS);
  const r = await answer;
  clearTimeout(repeat);
  log('node ' + r.node.id + ': ' + r.res.title, r.res.ok ? 'log-ok' : '');
  r.via_write = (viaChar || writeChar).uuid;
  return r;
}

function renderReport() {
  const lines = [];
  const n = (device && device.name) || '';
  const lbl = key => (t(key) + ':').padEnd(14);
  const indent = '\n' + ' '.repeat(14);
  lines.push(t('rptTitle') + '  Build ' + BUILD);
  lines.push('FIN:'.padEnd(14) + (n || '-'));
  lines.push(lbl('rptService') + ($('svc-name').textContent || '-'));
  lines.push(lbl('rptWrite') + (writeChars.length
    ? writeChars.map(c => c.uuid).join(indent) : (writeUuid || '-')));
  lines.push(lbl('rptNotify') + (notifyUuids.length ? notifyUuids.join(indent) : '-'));
  lines.push(lbl('rptReceived') + rxCount + t('rptFramesSince')
             + (rxLastUuid ? t('rptLastVia') + rxLastUuid : ''));
  lines.push(lbl('rptProjectCode') + hex([PROBE_PROJECT_CODE]));
  lines.push('');
  let answered = 0;
  const sub = key => '    ' + t(key).padEnd(11);
  for (const r of probeReport) {
    lines.push(String(r.node.id).padStart(2, ' ') + '  ' + t('nodeName' + r.node.id));
    lines.push(sub('rptSent') + r.sent);
    lines.push(sub('rptReceivedLine') + (r.got || t('rptNothing')));
    lines.push(sub('rptResult') + r.res.title);
    lines.push('               ' + r.res.note);
    if (r.via_write) lines.push('    ' + t('rptWrittenVia') + ' ' + r.via_write);
    if (r.via) lines.push('    ' + t('rptAnsweredVia') + ' ' + r.via);
    if (r.got) answered++;
  }
  lines.push('');
  if (!probeReport.length) {
    lines.push(t('rptNothingQueried'));
  } else if (answered === 0 && rxCount === 0) {
    lines.push(t('rptNoFrameConc'));
  } else if (answered === 0) {
    lines.push(t('rptNoAnswerConc'));
  } else {
    lines.push(t('rptAnsweredPre') + answered + t('rptAnsweredMid') + probeReport.length + t('rptAnsweredPost'));
    lines.push(t('rptAnsweredConc'));
  }
  $('probe-out').textContent = lines.join('\n');
  $('btn-probe-copy').disabled = !probeReport.length;
}

function setProbeBusy(on) {
  $('btn-probe').disabled = on || !writeChar;
  $('btn-probe-all').disabled = on || !writeChar;
  $('probe-node').disabled = on || !writeChar;
}

async function runProbe(nodes) {
  if (!writeChar) { log('not connected', 'log-err'); return; }
  if (!notifyUuids.length) {
    log('no notify channel: a probe would never hear an answer', 'log-err');
    return;
  }
  setProbeBusy(true);
  probeReport = [];
  const cands = writeChars.length ? writeChars : [writeChar];
  try {
    for (const ch of cands) {
      if (cands.length > 1) log('now writing via ' + ch.uuid);
      for (const node of nodes) {
        probeReport.push(await probeNode(node, ch));
        renderReport();
      }
      if (probeReport.some(r => r.got)) break;   // an answer settles it, no need to go on
    }
  } finally {
    setProbeBusy(false);
    renderReport();
  }
}

function stopKeepAlive() {
  if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
}

// The remembered FIN is the only thing this page keeps between visits, so the two
// buttons that depend on it are always switched together with the line that shows it.
function refreshOrigUi() {
  $('orig-name').textContent = originalName || '-';
  $('btn-restore').disabled = !originalName;
  $('btn-forget').disabled = !originalName;
}

function forgetOriginal() {
  originalName = null;
  try { localStorage.removeItem(LS_ORIG); } catch (e) {}
  refreshOrigUi();
  log('remembered FIN cleared from the browser; the name read on the next connect becomes the original');
}

function onDisconnected() {
  stopKeepAlive();
  writeChar = null;
  writeUuid = null;
  notifyUuids = [];
  setStatus('disconnected', 'stDisconnected');
  $('btn-conn').textContent = t('btnConnect');
  $('fin-in').disabled = true;
  $('btn-set').disabled = true;
  S.received71 = false;
  refreshUnlockButtons();
  refreshOrigUi();
  $('svc-name').textContent = '-';
  setProbeBusy(false);
  log('disconnected');
}

async function pickAndConnect() {
  if (!navigator.bluetooth) {
    log('this browser has no Web Bluetooth; use Bluefy on iOS', 'log-err');
    return;
  }
  try {
    setStatus('linking', 'stChoosing');
    // The chooser is narrowed to a scooter identity, TDE... or T1DE..., so the list
    // stays readable. Nothing beyond the name is checked: the write itself never
    // asks which model this is.
    device = await navigator.bluetooth.requestDevice({
      filters: NAME_PREFIXES.map(p => ({ namePrefix: p })),
      optionalServices: OPTIONAL_SERVICES,
    });
  } catch (e) {
    setStatus('disconnected', 'stDisconnected');
    log('chooser cancelled');
    return;
  }
  await connectTo(device);
}

async function connectTo(dev) {
  try {
    setStatus('linking', 'stConnecting');
    rxCount = 0;
    rxLastUuid = null;
    resetInventory();
    renderInventory();
    dev.removeEventListener('gattserverdisconnected', onDisconnected);
    dev.addEventListener('gattserverdisconnected', onDisconnected);
    deviceId = dev.id || '';   // kept out of the public log by redact()
    log('device chosen ' + sens(dev.name || '(no name)'));
    const server = await dev.gatt.connect();

    $('dev-name').textContent = dev.name || t('noName');
    if (dev.name) {
      // The advertised name IS the identity, so this is the value to write back.
      if (!originalName) {
        originalName = dev.name;
        try { localStorage.setItem(LS_ORIG, originalName); } catch (e) {}
      }
      refreshOrigUi();
      $('fin-in').value = dev.name;
    }

    // Find a service that carries a writable characteristic.
    const services = await server.getPrimaryServices();
    log('services found: ' + services.length);
    let picked = null;
    for (const svc of services) {
      const chars = await svc.getCharacteristics();
      // On 495353 hardware the app does not search, it hardcodes this one for writing
      // (app-service.js:3303). Prefer it, because "first characteristic that happens to
      // be writable" is not the same thing on every Bluetooth stack.
      const fixed = chars.find(c => c.uuid === ISSC_WRITE
                                 && (c.properties.write || c.properties.writeWithoutResponse));
      // Keep every writable one. Microchip's profile offers two, and which of them is
      // the data input is not something to assume when a silent probe is the result.
      const all = chars.filter(c => c.properties.write || c.properties.writeWithoutResponse);
      const w = fixed || all[0];
      if (w) {
        picked = { svc: svc, write: w, notify: chars.filter(c => c.properties.notify),
                   writable: [w].concat(all.filter(c => c !== w)) };
        if (svc.uuid === ISSC_SERVICE) break;   // the usual one wins
      }
    }
    if (!picked) throw new Error('no service with a writable characteristic');

    writeChar = picked.write;
    writeUuid = picked.write.uuid;
    writeChars = picked.writable;
    if (writeChars.length > 1) {
      log('further write characteristics: '
          + writeChars.slice(1).map(c => c.uuid).join(', '));
    }
    $('svc-name').textContent = picked.svc.uuid;
    log('service ' + picked.svc.uuid);
    log('write on ' + writeUuid);

    // Subscribe to every notify characteristic, not just the first. The app itself
    // switches to a second one a second after connecting when nothing has arrived
    // (app-service.js:9024), so a unit that reports on the other channel exists.
    notifyUuids = [];
    for (const nc of picked.notify) {
      try {
        await nc.startNotifications();
        nc.addEventListener('characteristicvaluechanged', ev => {
          for (const v of splitFrames(new Uint8Array(ev.target.value.buffer))) {
            rxCount++;
            rxLastUuid = nc.uuid;
            if (onProbeFrame(v, nc.uuid)) { log('RX ' + hex(v), 'log-rx'); continue; }  // node answer: always
            if (v.length && v[0] === 0x55) { if (diagLog) log('RX ' + hex(v), 'log-rx'); onInfoFrame(v); continue; }  // telemetry: verbose only
            log('RX ' + hex(v), 'log-rx');   // anything else: always
          }
        });
        notifyUuids.push(nc.uuid);
        log('notifications on ' + nc.uuid);
      } catch (e) {
        log('notifications not available on ' + nc.uuid + ': ' + (e && e.message ? e.message : e), 'log-err');
      }
    }
    if (!notifyUuids.length) log('no notify channel; a node probe cannot hear anything', 'log-err');

    buildProfile(services).catch(e => log('device profile incomplete: ' + (e && e.message ? e.message : e), 'log-err'));

    setStatus('connected', 'stConnected');
    $('btn-conn').textContent = t('btnDisconnect');
    $('fin-in').disabled = false;
    $('fin-in').placeholder = t('finPhConnected');
    $('btn-set').disabled = false;
    refreshOrigUi();
    setProbeBusy(false);

    // Handshake first, then keep the link alive the way the app does.
    await send(connectCode(++connectCounter), 'handshake');
    stopKeepAlive();
    keepAlive = setInterval(() => {
      if (writeChar) send(connectCode(++connectCounter), null);
    }, CONNECT_CODE_INTERVAL_MS);
  } catch (e) {
    log('connect failed: ' + (e && e.message ? e.message : e), 'log-err');
    setStatus('disconnected', 'stDisconnected');
  }
}

function disconnect() {
  stopKeepAlive();
  try { if (device && device.gatt.connected) device.gatt.disconnect(); } catch (e) {}
  onDisconnected();
}

function validate(name) {
  if (!name) return t('vFinEmpty');
  if (name.length > 16) return t('vFinTooLong');
  for (const ch of name) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c > 0x7E) return t('vFinAscii');
  }
  const first = name.charCodeAt(0);
  if (first < 0x30 || first > 0x7A) {
    return t('vFinFirstChar');
  }
  return null;
}

async function writeName(name) {
  const bad = validate(name);
  if (bad) { log('rejected: ' + bad, 'log-err'); return; }
  setStatus('writing', 'stWriting');
  log('writing FIN ' + sens(name), 'log-tx');
  await send(setDeviceNameFrame(name), 'FIN write');
  log('written; the controller stores it in EEPROM and hands it to the Bluetooth module');
  log('the link drops on write; reconnect once afterwards');
  if (device && device.gatt.connected) setStatus('connected', 'stConnected');
}

// ── document viewer (trbm-unlock model) ──────────────────────────────────────
// Guide, readme, disclaimer, licence, privacy notice and trademarks are files of this site. They
// open here, so a reader is never handed a raw markdown file or sent off to a code host. The page
// is German, so a data-doc name resolves to the German file; the English files ship as the source.

const DOC_TITLES = {
  'GUIDE.de.md': 'Anleitung', 'README.de.md': 'Readme', 'DISCLAIMER.de.md': 'Haftungsausschluss',
  'LICENSE.de.md': 'Lizenz', 'PRIVACY.de.md': 'Datenschutz', 'TRADEMARKS.de.md': 'Marken',
};

const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slug = s => s.toLowerCase().trim().replace(/[^\w\sÀ-ɏ-]/g, '').replace(/ /g, '-');

// Only the markdown these documents use: headings, lists with one level of nesting, tables, fenced
// code, quotes, rules, bold, inline code and links.
function mdToHtml(src) {
  const inline = s => escHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, href) => {
      if (DOC_TITLES[href]) return `<a href="${href}" data-docfile="${href}">${text}</a>`;
      if (href.startsWith('#')) return `<a href="${href}" data-anchor="${href.slice(1)}">${text}</a>`;
      return `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
    });

  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let listKind = null, li = null, para = [], inFence = false;
  const sink = () => (li ? li.parts : out);
  const flushPara = () => { if (para.length) { sink().push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const closeNested = () => { if (li && li.nested) { li.parts.push('</ul>'); li.nested = false; } };
  const closeLi = () => { if (!li) return; flushPara(); closeNested(); out.push('<li>' + li.parts.join('\n') + '</li>'); li = null; };
  const closeList = () => { closeLi(); if (listKind) { out.push('</' + listKind + '>'); listKind = null; } };
  const block = () => { flushPara(); closeList(); };
  const openList = kind => { flushPara(); if (listKind !== kind) { closeList(); out.push('<' + kind + '>'); listKind = kind; } else closeLi(); };
  const cells = l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim());

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const body = l.trim();
    const indented = /^ {2,}\S/.test(l);
    if (inFence) {
      if (body.startsWith('```')) { sink().push('</code></pre>'); inFence = false; } else sink().push(escHtml(l));
      continue;
    }
    if (body.startsWith('```')) { if (li) { flushPara(); closeNested(); } else block(); sink().push('<pre><code>'); inFence = true; continue; }
    if (body === '') { if (li && /^ {2,}\S/.test(lines[i + 1] || '')) flushPara(); else block(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(body)) { block(); out.push('<hr>'); continue; }
    if (body.startsWith('|') && /^\|[\s:|-]+\|?\s*$/.test((lines[i + 1] || '').trim())) {
      if (li) { flushPara(); closeNested(); } else block();
      sink().push('<div class="doc-table"><table><thead><tr>'
        + cells(body).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>');
      i++;
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
        sink().push('<tr>' + cells(lines[++i].trim()).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>');
      }
      sink().push('</tbody></table></div>');
      continue;
    }
    let m;
    if ((m = body.match(/^(#{1,4})\s+(.*)$/))) { block(); const n = m[1].length; out.push(`<h${n} id="${slug(m[2])}">${inline(m[2])}</h${n}>`); continue; }
    if ((m = body.match(/^>\s?(.*)$/))) { if (li) { flushPara(); closeNested(); } else block(); sink().push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
    if (indented && li && (m = body.match(/^[-*]\s+(.*)$/))) { flushPara(); if (!li.nested) { li.parts.push('<ul class="nested">'); li.nested = true; } li.parts.push('<li>' + inline(m[1]) + '</li>'); continue; }
    if ((m = body.match(/^[-*]\s+(.*)$/)) && !indented) { openList('ul'); li = { parts: [inline(m[1])], nested: false }; continue; }
    if ((m = body.match(/^\d+\.\s+(.*)$/)) && !indented) { openList('ol'); li = { parts: [inline(m[1])], nested: false }; continue; }
    if (li && !indented) closeList();
    if (li) closeNested();
    para.push(body);
  }
  if (inFence) sink().push('</code></pre>');
  block();
  return out.join('\n');
}

const docCache = {};
// A data-doc name resolves to the German file; everything the app links internally is a German doc.
const docFile = name => (name === 'DISCLAIMER') ? 'DISCLAIMER.de.md' : name + '.de.md';

function openDoc(name) { openDocFile(docFile(name)); }

function openDocFile(file, anchor) {
  const dlg = $('doc'), body = $('doc-body');
  if (!dlg || !body) return;
  $('doc-title').textContent = DOC_TITLES[file] || file;
  if (typeof dlg.showModal === 'function') dlg.showModal();
  const show = html => {
    body.innerHTML = html;   // scan-ok: markdown of our own documents, rendered by mdToHtml which escapes first
    const h1 = body.querySelector('h1');
    if (h1) { $('doc-title').textContent = h1.textContent.trim(); h1.remove(); }
    body.scrollTop = 0;
    if (!anchor) return;
    const target = body.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(anchor) : anchor));
    if (target) body.scrollTop = target.offsetTop - body.offsetTop;
  };
  if (docCache[file]) { show(docCache[file]); return; }
  body.innerHTML = '<p>' + escHtml(t('docLoading')) + '</p>';   // scan-ok: escaped i18n value
  fetch(file + '?v=' + BUILD)
    .then(r => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.text(); })
    .then(txt => { docCache[file] = mdToHtml(txt); show(docCache[file]); })
    .catch(e => {
      body.innerHTML = '<p>' + escHtml(t('docFail')) + '</p><pre>'   // scan-ok: escaped i18n value
                     + escHtml(file + ': ' + (e && e.message ? e.message : e)) + '</pre>';
    });
}

function wireDocViewer() {
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const jump = e.target.closest('[data-anchor]');
    if (jump) {
      e.preventDefault();
      const body = $('doc-body');
      const target = body && body.querySelector('#' + CSS.escape(jump.getAttribute('data-anchor')));
      if (target) body.scrollTop = target.offsetTop - body.offsetTop;
      return;
    }
    const a = e.target.closest('[data-doc], [data-docfile]');
    if (!a) return;
    e.preventDefault();
    const file = a.getAttribute('data-docfile');
    if (file) openDocFile(file); else openDoc(a.getAttribute('data-doc'));
  });
  ['doc-x', 'doc-close'].forEach(id => {
    const b = $(id);
    if (b) b.addEventListener('click', () => { const d = $('doc'); if (d) d.close(); });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  // i18n first: wire the DE/EN toggle and paint the static [data-t] markup in the active
  // language, then set the initial status through t() so the mismatch check below can still
  // override it. Node options get a second applyLang() once they are built.
  initLangSwitch();
  applyLang();
  initTheme();
  setStatus('disconnected', 'stDisconnected');

  // First thing, before anything can throw on a missing element. The build number in
  // the footer comes from this file, and this file is always fetched fresh because its
  // address carries the version. index.html carries no version of its own, so it can be
  // older than the script while the footer still reads the new build. That looks exactly
  // like a feature that was never built, so it gets named instead of guessed at.
  const pageBuild = (document.body.dataset && document.body.dataset.build) || t('buildNotSpecified');
  const missing = REQUIRED_IDS.filter(id => !$(id));
  if (pageBuild !== BUILD || missing.length) {
    if ($('status')) setStatus('disconnected', 'stStale');
    log('WARNING: markup is ' + pageBuild + ', script is ' + BUILD, 'log-err');
    if (missing.length) log('missing elements: ' + missing.join(', '), 'log-err');
    log('page and script do not match; what you see is older than the footer build, which comes from the script', 'log-err');
  }

  $('build-ver').textContent = 'Build ' + BUILD;
  try {
    const stored = localStorage.getItem(LS_ORIG);
    if (stored) originalName = stored;
  } catch (e) {}
  refreshOrigUi();

  log('Blade-Test ' + BUILD);
  if (!navigator.bluetooth) log('no Web Bluetooth in this browser; use Bluefy on iOS', 'log-err');

  on('btn-conn', 'click', () => {
    if (device && device.gatt && device.gatt.connected) disconnect(); else pickAndConnect();
  });
  const sel = $('probe-node');
  for (const n of NODES) {
    const o = document.createElement('option');
    o.value = String(n.id);
    o.setAttribute('data-t', 'node' + n.id);   // label injected by applyLang; the id prefix is part of the value
    o.textContent = t('node' + n.id);           // localized immediately; applyLang keeps it in sync
    sel.appendChild(o);
  }
  renderReport();
  renderInventory();

  // Re-apply now that the node options carry their data-t labels.
  applyLang();

  on('btn-probe', 'click', () => {
    const id = parseInt(sel.value, 10);
    const node = NODES.find(n => n.id === id);
    if (node) runProbe([node]);
  });
  on('btn-probe-all', 'click', () => runProbe(NODES));
  on('btn-probe-copy', 'click', async () => {
    try {
      await navigator.clipboard.writeText($('probe-out').textContent);
      log('report copied to clipboard', 'log-ok');
    } catch (e) {
      log('copy failed; select the text by hand', 'log-err');
    }
  });

  on('btn-set', 'click', () => writeName($('fin-in').value.trim()));
  on('btn-restore', 'click', () => {
    if (!originalName) { log('no original FIN remembered', 'log-err'); return; }
    writeName(originalName);
  });
  on('btn-forget', 'click', forgetOriginal);
  on('btn-prof-copy', 'click', async () => {
    try {
      await navigator.clipboard.writeText($('prof-out').textContent);
      log('profile copied to clipboard', 'log-ok');
    } catch (e) {
      log('copy failed; select the text by hand', 'log-err');
    }
  });
  on('btn-inv-copy', 'click', async () => {
    try {
      await navigator.clipboard.writeText($('inv-out').textContent);
      log('inventory copied to clipboard', 'log-ok');
    } catch (e) {
      log('copy failed; select the text by hand', 'log-err');
    }
  });

  // Log controls (public-log toggle default-on, diagnostics off, copy / clear / save).
  { const pl = $('public-log'); if (pl) { publicLog = pl.checked; pl.addEventListener('change', () => { publicLog = pl.checked; renderLog(); }); } }
  { const dl = $('diag-log'); if (dl) { diagLog = dl.checked; dl.addEventListener('change', () => { diagLog = dl.checked; log(diagLog ? 'diagnostics on' : 'diagnostics off', 'log-rx'); }); } }
  on('btn-copy-log', 'click', copyLog);
  on('btn-clear-log', 'click', clearLog);
  on('btn-save-log', 'click', saveLog);
  wireDocViewer();

  on('btn-req-info', 'click', () => requestAssemblies());
  on('btn-unlock-auto', 'click', () => sendCruise(1));
  on('btn-unlock-man', 'click', () => sendCruise(2));
  on('btn-lock', 'click', () => sendCruise(0));
  on('fin-in', 'keydown', e => { if (e.key === 'Enter') $('btn-set').click(); });
});
