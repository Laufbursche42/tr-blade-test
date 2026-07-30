// Laufbursche FIN test: connect to a scooter over Web Bluetooth and write the VCU
// identity, the string the app calls the FIN and the Bluetooth module advertises as
// its name.
//
// Nothing here looks at the model. The chooser lists devices whose name starts with
// TDE or T1DE and the write goes to whatever accepted the link, which is the point
// of this tool.
//
// The frame is a byte-for-byte port of CommandBuilder.setDeviceName in the Laufbursche
// Edition app: AA 1F, then 16 ASCII name bytes, then one 0xFF, then CRC-8.

'use strict';

const BUILD = 'v1';

// Candidate GATT services the Teverun Bluetooth module exposes. The ISSC transparent
// UART is the usual one; cheap modules use a 16-bit UUID from the vendor range, so the
// whole 0xFC00 to 0xFFFF block is declared. Web Bluetooth only lets a page touch a
// service it named up front.
const ISSC_SERVICE = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
const NORDIC_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const VENDOR_16BIT = [];
for (const base of ['fc', 'fd', 'fe', 'ff']) {
  for (let i = 0; i < 256; i++) {
    VENDOR_16BIT.push('0000' + base + i.toString(16).padStart(2, '0') + '-0000-1000-8000-00805f9b34fb');
  }
}
const OPTIONAL_SERVICES = [ISSC_SERVICE, NORDIC_SERVICE].concat(VENDOR_16BIT);

// The advertised name is the identity: TDE... is the limited one, anything else is
// an identity whose first three characters no longer read TDE. TEU is in the list
// because a rider typed it and a tool that cannot see a scooter cannot fix it.
const NAME_PREFIXES = ['TDE', 'T1DE', 'TEU'];

const CONNECT_CODE_INTERVAL_MS = 6500;   // the app's keep-alive spacing
const WRITE_GAP_MS = 200;                // the app's spacing between two frames
const LS_ORIG = 'fintest_orig_name';

let device = null;
let writeChar = null;
let keepAlive = null;
let connectCounter = 0;
let originalName = null;
let busy = Promise.resolve();

const $ = id => document.getElementById(id);

function log(msg) {
  const el = $('log');
  const t = new Date().toTimeString().slice(0, 8);
  el.textContent = t + '  ' + msg + '\n' + el.textContent;
}

function setStatus(state, text) {
  $('status').dataset.state = state;
  $('status').textContent = text;
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

// Web Bluetooth rejects a write while another is in flight, so every write queues.
function send(bytes, what) {
  busy = busy.then(async () => {
    if (!writeChar) throw new Error('keine Schreib-Charakteristik');
    await writeChar.writeValue(bytes);
    if (what) {
      log(what + ': ' + hex(bytes));
      $('frame').textContent = hex(bytes);
    }
    await new Promise(r => setTimeout(r, WRITE_GAP_MS));
  }).catch(e => { log('Schreiben fehlgeschlagen: ' + (e && e.message ? e.message : e)); });
  return busy;
}

function stopKeepAlive() {
  if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
}

function onDisconnected() {
  stopKeepAlive();
  writeChar = null;
  setStatus('disconnected', 'getrennt');
  $('btn-conn').textContent = 'Verbinden';
  $('fin-in').disabled = true;
  $('btn-set').disabled = true;
  $('btn-restore').disabled = !originalName;
  $('svc-name').textContent = '-';
  log('Verbindung getrennt');
}

async function pickAndConnect() {
  if (!navigator.bluetooth) {
    log('Dieser Browser hat kein Web Bluetooth. Auf iOS Bluefy nutzen.');
    return;
  }
  try {
    setStatus('linking', 'waehlen ...');
    // The chooser is narrowed to a scooter identity, TDE... or T1DE..., so the list
    // stays readable. Nothing beyond the name is checked: the write itself never
    // asks which model this is.
    device = await navigator.bluetooth.requestDevice({
      filters: NAME_PREFIXES.map(p => ({ namePrefix: p })),
      optionalServices: OPTIONAL_SERVICES,
    });
  } catch (e) {
    setStatus('disconnected', 'getrennt');
    log('Auswahl abgebrochen');
    return;
  }
  await connectTo(device);
}

async function connectTo(dev) {
  try {
    setStatus('linking', 'verbinden ...');
    dev.removeEventListener('gattserverdisconnected', onDisconnected);
    dev.addEventListener('gattserverdisconnected', onDisconnected);
    const server = await dev.gatt.connect();

    $('dev-name').textContent = dev.name || '(ohne Namen)';
    if (dev.name) {
      // The advertised name IS the identity, so this is the value to write back.
      if (!originalName) {
        originalName = dev.name;
        try { localStorage.setItem(LS_ORIG, originalName); } catch (e) {}
      }
      $('orig-name').textContent = originalName;
      $('fin-in').value = dev.name;
    }

    // Find a service that carries a writable characteristic.
    const services = await server.getPrimaryServices();
    log('Dienste gefunden: ' + services.length);
    let picked = null;
    for (const svc of services) {
      const chars = await svc.getCharacteristics();
      const w = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
      const n = chars.find(c => c.properties.notify);
      if (w) {
        picked = { svc: svc, write: w, notify: n };
        if (svc.uuid === ISSC_SERVICE) break;   // the usual one wins
      }
    }
    if (!picked) throw new Error('kein Dienst mit beschreibbarer Charakteristik');

    writeChar = picked.write;
    $('svc-name').textContent = picked.svc.uuid;
    log('Dienst ' + picked.svc.uuid);
    log('Schreiben auf ' + picked.write.uuid);

    if (picked.notify) {
      try {
        await picked.notify.startNotifications();
        picked.notify.addEventListener('characteristicvaluechanged', ev => {
          const v = new Uint8Array(ev.target.value.buffer);
          if (v.length && v[0] === 0x55) return;   // telemetry, not interesting here
          log('empfangen: ' + hex(v));
        });
        log('Benachrichtigungen an ' + picked.notify.uuid);
      } catch (e) {
        log('Benachrichtigungen nicht moeglich: ' + (e && e.message ? e.message : e));
      }
    }

    setStatus('connected', 'verbunden');
    $('btn-conn').textContent = 'Trennen';
    $('fin-in').disabled = false;
    $('fin-in').placeholder = 'z. B. T1DE0000000000';
    $('btn-set').disabled = false;
    $('btn-restore').disabled = !originalName;

    // Handshake first, then keep the link alive the way the app does.
    await send(connectCode(++connectCounter), 'Handschlag');
    stopKeepAlive();
    keepAlive = setInterval(() => {
      if (writeChar) send(connectCode(++connectCounter), null);
    }, CONNECT_CODE_INTERVAL_MS);
  } catch (e) {
    log('Verbinden fehlgeschlagen: ' + (e && e.message ? e.message : e));
    setStatus('disconnected', 'getrennt');
  }
}

function disconnect() {
  stopKeepAlive();
  try { if (device && device.gatt.connected) device.gatt.disconnect(); } catch (e) {}
  onDisconnected();
}

function validate(name) {
  if (!name) return 'Die Kennung darf nicht leer sein.';
  if (name.length > 16) return 'Hoechstens 16 Zeichen.';
  for (const ch of name) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c > 0x7E) return 'Nur ASCII-Zeichen.';
  }
  const first = name.charCodeAt(0);
  if (first < 0x30 || first > 0x7A) {
    return 'Das erste Zeichen muss im Bereich 0x30 bis 0x7A liegen, die Steuerung lehnt es sonst ab.';
  }
  return null;
}

async function writeName(name) {
  const bad = validate(name);
  if (bad) { log('abgelehnt: ' + bad); return; }
  setStatus('writing', 'schreiben ...');
  log('schreibe Kennung: "' + name + '"');
  await send(setDeviceNameFrame(name), 'Kennung');
  log('geschrieben. Die Steuerung legt den Wert im EEPROM ab und gibt ihn an das Bluetooth-Modul weiter.');
  log('Die Verbindung bricht dabei ab. Danach einmal neu verbinden.');
  if (device && device.gatt.connected) setStatus('connected', 'verbunden');
}

window.addEventListener('DOMContentLoaded', () => {
  $('build-ver').textContent = 'Build ' + BUILD;
  try {
    const stored = localStorage.getItem(LS_ORIG);
    if (stored) {
      originalName = stored;
      $('orig-name').textContent = stored;
      $('btn-restore').disabled = false;
    }
  } catch (e) {}

  log('FIN-Test ' + BUILD);
  if (!navigator.bluetooth) log('Kein Web Bluetooth in diesem Browser. Auf iOS Bluefy nutzen.');

  $('btn-conn').addEventListener('click', () => {
    if (device && device.gatt && device.gatt.connected) disconnect(); else pickAndConnect();
  });
  $('btn-set').addEventListener('click', () => writeName($('fin-in').value.trim()));
  $('btn-restore').addEventListener('click', () => {
    if (!originalName) { log('keine urspruengliche Kennung gemerkt'); return; }
    writeName(originalName);
  });
  $('fin-in').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-set').click(); });
});
