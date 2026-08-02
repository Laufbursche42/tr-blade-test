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

const BUILD = 'v4';

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
// Matched against the START of the advertised name, so TDE also covers TDE1, TEU covers
// TEU1 and T1 covers T1DE. Longer forms need no entry of their own.
const NAME_PREFIXES = ['TDE', 'T1', 'TEU'];

const CONNECT_CODE_INTERVAL_MS = 6500;   // the app's keep-alive spacing
const WRITE_GAP_MS = 200;                // the app's spacing between two frames
const LS_ORIG = 'fintest_orig_name';

let device = null;
let writeChar = null;
let notifyUuid = null;
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
const PROBE_TIMEOUT_MS = 4000;

// key = the number the app's own picker carries, sent as that byte value.
const NODES = [
  { id: 50, text: 'TFT-40 Display' },
  { id: 60, text: 'LCD-43 Display' },
  { id: 70, text: 'Lichtmodul' },
  { id: 30, text: 'Controller hinten' },
  { id: 31, text: 'Controller vorn' },
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

const PROBE_REASONS = {
  0x01: ['Node existiert nicht', 'Die Gegenstelle spricht das Protokoll, kennt diese Baugruppe aber nicht.'],
  0x02: ['Node kann kein Update', 'Die Baugruppe ist da, hat aber keinen Update-Weg.'],
  0x03: ['Projektcode passt nicht', 'Die Baugruppe ist da UND kann geflasht werden. Genau das wollten wir wissen.'],
  0x04: ['Nicht im Ruhezustand', 'Die Baugruppe ist da und antwortet, ist gerade aber beschaeftigt.'],
};

// Returns null if this is not an answer to our question.
function decodeHandshakeResp(v) {
  if (v.length < 12 || v[0] !== 0xCC) return null;
  if (v[1] !== HANDSHAKE_ID[0] || v[2] !== 0xEA) return null;
  const body = [];
  for (let i = 1; i <= 10; i++) body.push(v[i]);
  if (crc8(body, 10) !== v[11]) return { title: 'Antwort verworfen', note: 'CRC-8 der Antwort stimmt nicht.', ok: false };
  if (v[3] === 0x01 && v[4] === 0xAA) {
    return { title: 'Node akzeptiert', ok: true,
             note: 'Die Baugruppe wuerde das Update jetzt annehmen. Diese Seite sendet nichts weiter.' };
  }
  if (v[3] === 0x01 && v[4] === 0x55) {
    const r = PROBE_REASONS[v[5]];
    if (r) return { title: r[0], note: r[1], ok: v[5] !== 0x01 };
    return { title: 'Abgelehnt, Grund ' + hex([v[5]]), note: 'Grund steht nicht in der App.', ok: false };
  }
  if (v[3] === 0x02 && v[4] === 0xA5) {
    return { title: 'Bestaetigung am Geraet noetig', ok: true,
             note: 'Die Baugruppe ist da und will eine Freigabe. Diese Seite gibt keine.' };
  }
  if (v[3] === 0x03) {
    return { title: 'Fortschrittsmeldung ' + hex([v[4], v[5]]), ok: true,
             note: 'Unerwartet auf eine reine Anfrage hin. Bitte melden.' };
  }
  return { title: 'Unbekannte Antwort', note: 'Aufbau passt, Inhalt steht nicht in der App.', ok: true };
}

// Called from the notify handler. True means the frame was ours.
function onProbeFrame(v) {
  if (!probeWaiting) return false;
  const res = decodeHandshakeResp(v);
  if (!res) return false;
  const w = probeWaiting;
  probeWaiting = null;
  clearTimeout(w.timer);
  w.resolve({ node: w.node, sent: w.sent, got: hex(v), res: res });
  return true;
}

async function probeNode(node) {
  const frame = handshakeFrame(node.id, PROBE_PROJECT_CODE);
  const sent = hex(frame);
  log('frage Node ' + node.id + ' (' + node.text + ')');
  const answer = new Promise(resolve => {
    const timer = setTimeout(() => {
      probeWaiting = null;
      resolve({ node: node, sent: sent, got: null,
                res: { title: 'Keine Antwort', ok: false,
                       note: 'Die Gegenstelle hat den Rahmen nicht beantwortet.' } });
    }, PROBE_TIMEOUT_MS);
    probeWaiting = { node: node, resolve: resolve, timer: timer, sent: sent };
  });
  await send(frame, 'Node-Anfrage');
  const r = await answer;
  log('Node ' + r.node.id + ': ' + r.res.title);
  return r;
}

function renderReport() {
  const lines = [];
  lines.push('Laufbursche Node-Abfrage  Build ' + BUILD);
  lines.push('Geraet:     ' + ((device && device.name) || '-'));
  lines.push('Dienst:     ' + ($('svc-name').textContent || '-'));
  lines.push('Melden:     ' + (notifyUuid || '-'));
  const n = (device && device.name) || '';
  lines.push('Name beginnt mit T2 (die App wuerde den ver2-Weg nehmen): ' + (n.startsWith('T2') ? 'ja' : 'nein'));
  lines.push('Projektcode der Anfrage: ' + hex([PROBE_PROJECT_CODE]));
  lines.push('');
  let answered = 0;
  for (const r of probeReport) {
    lines.push(String(r.node.id).padStart(2, ' ') + '  ' + r.node.text);
    lines.push('    gesendet:  ' + r.sent);
    lines.push('    empfangen: ' + (r.got || '(nichts)'));
    lines.push('    Ergebnis:  ' + r.res.title);
    lines.push('               ' + r.res.note);
    if (r.got) answered++;
  }
  lines.push('');
  if (!probeReport.length) {
    lines.push('Noch nichts abgefragt.');
  } else if (answered === 0) {
    lines.push('Fazit: keine einzige Antwort. Die Gegenstelle hinter Bluetooth kennt');
    lines.push('den Node-Weg nicht, jedenfalls nicht auf diesen Rahmen hin.');
  } else {
    lines.push('Fazit: ' + answered + ' von ' + probeReport.length + ' Anfragen beantwortet.');
    lines.push('Damit steht fest, dass die Gegenstelle hinter Bluetooth das Node-Protokoll');
    lines.push('spricht. Welche Baugruppen dahinter haengen, steht oben Zeile fuer Zeile.');
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
  if (!writeChar) { log('nicht verbunden'); return; }
  if (!notifyUuid) {
    log('Ohne Meldekanal ist keine Abfrage moeglich, es kaeme keine Antwort an.');
    return;
  }
  setProbeBusy(true);
  probeReport = [];
  try {
    for (const node of nodes) {
      probeReport.push(await probeNode(node));
      renderReport();
    }
  } finally {
    setProbeBusy(false);
    renderReport();
  }
}

function stopKeepAlive() {
  if (keepAlive) { clearInterval(keepAlive); keepAlive = null; }
}

function onDisconnected() {
  stopKeepAlive();
  writeChar = null;
  notifyUuid = null;
  setStatus('disconnected', 'getrennt');
  $('btn-conn').textContent = 'Verbinden';
  $('fin-in').disabled = true;
  $('btn-set').disabled = true;
  $('btn-restore').disabled = !originalName;
  $('svc-name').textContent = '-';
  setProbeBusy(false);
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
          if (onProbeFrame(v)) return;             // answer to a node question
          if (v.length && v[0] === 0x55) return;   // telemetry, not interesting here
          log('empfangen: ' + hex(v));
        });
        notifyUuid = picked.notify.uuid;
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
    setProbeBusy(false);

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

  log('Blade-Test ' + BUILD);
  if (!navigator.bluetooth) log('Kein Web Bluetooth in diesem Browser. Auf iOS Bluefy nutzen.');

  $('btn-conn').addEventListener('click', () => {
    if (device && device.gatt && device.gatt.connected) disconnect(); else pickAndConnect();
  });
  const sel = $('probe-node');
  for (const n of NODES) {
    const o = document.createElement('option');
    o.value = String(n.id);
    o.textContent = n.id + '  ' + n.text;
    sel.appendChild(o);
  }
  renderReport();

  $('btn-probe').addEventListener('click', () => {
    const id = parseInt(sel.value, 10);
    const node = NODES.find(n => n.id === id);
    if (node) runProbe([node]);
  });
  $('btn-probe-all').addEventListener('click', () => runProbe(NODES));
  $('btn-probe-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('probe-out').textContent);
      log('Protokoll in die Zwischenablage gelegt');
    } catch (e) {
      log('Kopieren ging nicht, den Text bitte von Hand markieren');
    }
  });

  $('btn-set').addEventListener('click', () => writeName($('fin-in').value.trim()));
  $('btn-restore').addEventListener('click', () => {
    if (!originalName) { log('keine urspruengliche Kennung gemerkt'); return; }
    writeName(originalName);
  });
  $('fin-in').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-set').click(); });
});
