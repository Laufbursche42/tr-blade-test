'use strict';

// Every visible UI string of the page, in both languages. Keys match the data-t / data-t-ph
// attributes in index.html and the t() calls in app.js. German is the default. The protocol log
// and the copyable diagnostic dumps (profile / inventory / node report) stay technical and are
// left as-is on purpose, like the log; only the chrome UI is translated here.
// Exposes globals app.js calls: t(), applyLang(), initLangSwitch().
window.I18N = {
  de: {
    brandSub: "Blade-Test",
    langGroup: "Sprache",
    themeToLight: "Auf helle Darstellung umschalten",
    themeToDark: "Auf dunkle Darstellung umschalten",

    s1Title: "Wozu das hier ist",
    about1: "Verbinden und die FIN des Scooters schreiben, nichts weiter. Die Liste zeigt Geräte, deren Name mit <b>TDE</b>, <b>T1</b> oder <b>TEU</b> beginnt. Geprüft wird der Anfang, also sind <b>TDE1</b>, <b>T1DE</b> und <b>TEU1</b> ebenfalls dabei. Welches Modell dahinter steckt, fragt diese Seite nicht.",
    about2: "Die FIN ist der Bluetooth-Name des Scooters. Sie landet im EEPROM der Steuerung und überlebt den Neustart. Schreib dir den ursprünglichen Wert auf, bevor du ihn änderst.",
    about3: "<b>Machbarkeitsstudie:</b> Diese Seite zeigt, was das Bluetooth-Protokoll eines Trittbrett-Scooters technisch möglich macht, sie ist kein fertiges Produkt. Fehlerfreier Betrieb wird nicht versprochen, es gibt keinerlei Gewährleistung. Alles, was du hier tust, tust du auf eigenes Risiko. <a href=\"#\" data-doc=\"DISCLAIMER\">Haftungsausschluss lesen</a>. Probleme oder Fehler beim Testen bitte per DM an Laufbursche im escooter-stammtisch oder als GitHub-Issue melden. Dieses Werkzeug tunt, entdrosselt oder entsperrt nichts: es schreibt nur die Geräte-Identität (die FIN, also den Bluetooth-Namen) und prüft, ob Baugruppen hinter der Bluetooth-Verbindung erreichbar sind. Die FIN zu ändern schaltet nichts frei, denn auf einer Laufbursche-Firmware hängt die Drossel am Bluetooth-Schloss, nicht am Namen.",

    connTitle: "Verbindung",
    btnConnect: "Verbinden",
    btnDisconnect: "Trennen",
    lblDevice: "Gerät:",
    lblService: "Dienst:",
    connHint: "Läuft in Chrome auf Android oder am Rechner und in Bluefy auf iOS. Safari hat kein Web Bluetooth.",

    profTitle: "Gerätesteckbrief",
    profHint1: "Was das Bluetooth-Modul selbst über sich verrät: alle angebotenen Dienste, alle Charakteristiken mit ihren Fähigkeiten, dazu der genormte Geräteinformations-Dienst <span class=\"mono\">180A</span> im Klartext, also Hersteller, Modell und Stände. Füllt sich beim Verbinden von selbst.",
    profHint2: "Gelesen wird ausschließlich aus <span class=\"mono\">180A</span>, denn dieser Dienst ist genau dafür da. Von unbekannten Hersteller-Charakteristiken wird nichts gelesen, weil ein Lesezugriff dort etwas auslösen könnte. Die Seriennummer sperrt der Browser von sich aus, das ist kein Fehler.",
    btnProfCopy: "Steckbrief kopieren",

    lockTestTitle: "Sperr-Test: gesperrt gegen entsperrt aufnehmen",
    lockTestIntro: "Das hier ist der eigentliche Test. Ziel: herausfinden, an welchem <b>Byte</b> der Scooter dauerhaft anzeigt, ob er gedrosselt (22) oder frei (65) ist. Der Tempomat taugt dafür nicht, weil er am Blade sofort wieder auf Aus springt. Es wird <b>nichts gesendet</b>, die Seite liest nur mit.",
    lockStep1: "<b>Verbinden</b> (Karte oben). Ein paar Sekunden streamen lassen.",
    lockStep2: "Scooter in den <b>gesperrten</b> Zustand bringen (22). Rund 10 Sekunden warten, damit <span class=\"mono\">55 71</span> sicher durchläuft.",
    lockStep3: "Scooter mit deiner bisher funktionierenden Methode <b>entsperren</b> (65). Wieder rund 10 Sekunden warten.",
    lockStep4: "Unten auf <b>Inventar kopieren</b> tippen und mir den ganzen Text schicken.",
    lockTestNote: "Weil die Seite <b>jede abweichende Ausprägung</b> eines Rahmens einzeln behält, hat <span class=\"mono\">55 71</span> danach zwei Ausprägungen (gesperrt und entsperrt). Die neue Zeile <b>DIFF über Ausprägungen</b> zeigt dann genau das Byte, das sich unterscheidet und bleibt. Beachte besonders <span class=\"mono\">Byte17 Systemstatus</span>, <span class=\"mono\">Bit6</span> und <span class=\"mono\">Speed-Limit</span>. Achte darauf, während der Aufnahme <b>nicht den Gang zu wechseln</b>, sonst ändert sich Byte3 mit.",

    cruiseTitle: "Tempomat senden (entsperren/sperren auf dieser Seite)",
    cruiseWarn: "Bluetooth ist exklusiv: du kannst nicht gleichzeitig mit der Teverun-App verbunden sein. Darum senden diese Knöpfe den Tempomat-Befehl direkt von hier. Es geht der normale <span class=\"mono\">0x18</span>-Einstellungsrahmen raus, alle übrigen Werte werden aus dem letzten <span class=\"mono\">55 71</span> unverändert gespiegelt, nur der Tempomat ändert sich.",
    btnUnlockAuto: "Entsperren: Tempomat auto (1)",
    btnUnlockMan: "Entsperren: Tempomat manuell (2)",
    btnLockCruise: "Sperren: Tempomat aus (0)",
    cruiseNote: "Der Tempomat-Befehl kippt im ESC die Klemme - das ist die <b>Aktion</b> zum Ent- und Sperren, und die steht fest. Zum <b>Erkennen</b>, ob der Blade gesperrt ist, taugt der Tempomat-Wert dagegen nicht, weil er sofort auf Aus zurückfällt. Diese Knöpfe schalten den Zustand also nur hin und her, damit die <b>DIFF</b>-Zeile bei <span class=\"mono\">55 71</span> zeigt, welches Byte den Zustand <b>dauerhaft</b> trägt. Ablauf: erst <b>Verbinden</b> und warten, bis die Knöpfe aktiv werden; dann <b>Tempomat aus</b> senden und per Live-Cam prüfen (gedrosselt?); dann <b>Tempomat auto</b> (frei?); danach oben <b>Inventar kopieren</b> und mir schicken.",

    reqTitle: "Baugruppen-Info anfordern (proType / proCode)",
    reqHint: "Die Frames <span class=\"mono\">55 44</span> (Display/Akku/Licht) und <span class=\"mono\">55 45</span> (Motorcontroller = Blade-ESC) streamen nicht von selbst - sie sind Antworten auf eine Anforderung. Dieser Knopf sendet die Anforderungs-Frames; die Antworten erscheinen dann unten im Inventar mit proType und proCode. Damit finden wir den echten Firmware-Schlüssel des Blade-ESC.",
    btnReqInfo: "Baugruppen-Info anfordern",

    invTitle: "Was antwortet uns da",
    invIntro: "Dafür wird <b>nichts gesendet</b>. Der Scooter meldet von sich aus, welche Baugruppen er kennt, mit Typ, Code und Version. Diese Seite liest nur mit. Die Liste füllt sich nach dem Verbinden von selbst, manche Angaben kommen erst nach ein paar Sekunden.",
    invNote: "<b>nicht gemeldet</b> heißt, dass die Gegenstelle für diese Baugruppe nur Füllbytes schickt. Sie weiß dann selbst nichts davon, egal was verbaut ist. Unter der Übersicht steht jede empfangene Rahmenart einzeln, und darin <b>jede abweichende Ausprägung eigen</b> mit ihrer Häufigkeit: erst die rohen Bytes, darunter die Felder, soweit bekannt. Eine Rahmenart, die hier niemand auswertet, bleibt trotzdem sichtbar.",
    btnInvCopy: "Inventar kopieren",

    probeTitle: "Node-Abfrage",
    probeIntro: "Fragt eine Baugruppe, ob sie hinter dieser Bluetooth-Verbindung erreichbar ist und ob sie ein Update annehmen könnte. Es wird <b>nur gefragt</b>. Der Befehl, der ein Update tatsächlich beginnt, ist ein anderer und steht in dieser Seite nirgends.",
    lblNode: "Baugruppe",
    btnProbe: "Abfragen",
    btnProbeAll: "Alle nacheinander abfragen",
    probeWarn: "<b>Wonach wir suchen.</b> Schon <i>irgendeine</i> gültige Antwort beweist, dass die Gegenstelle hinter Bluetooth dieses Update-Protokoll überhaupt spricht. Ein „Projektcode passt nicht\" beweist zusätzlich, dass die genannte Baugruppe erreichbar ist und geflasht werden könnte. Bleibt alles still, gibt es diesen Weg auf diesem Gerät nicht.",
    probeNote: "Die Anfrage nennt absichtlich einen Projektcode, den keine Baugruppe haben kann. Damit ist die freundlichste mögliche Antwort „Code passt nicht\", und ein versehentliches Ja kann es nicht geben.",
    btnProbeCopy: "Protokoll kopieren",

    finTitle: "FIN schreiben",
    lblNewFin: "Neue FIN",
    finPhIdle: "erst verbinden",
    finPhConnected: "z. B. T1DE0000000000",
    btnWrite: "Schreiben",
    btnRestore: "Ursprüngliche FIN zurückschreiben",
    finHint1: "Höchstens 16 Zeichen, nur ASCII. Das erste Zeichen muss druckbar sein, die Steuerung prüft es gegen den Bereich 0x30 bis 0x7A. Kürzere Namen füllt der Befehl mit Leerzeichen auf, so wie die Firmware selbst.",
    finRemembered: "Beim Verbinden gemerkt:",
    finWarn: "<b>Diese Seite speichert deine FIN im Browser.</b> Damit „Ursprüngliche FIN zurückschreiben\" auch nach einem Neuladen noch weiß, worauf es zurücksetzen soll, legt die Seite den beim ersten Verbinden gelesenen Namen im lokalen Speicher deines Browsers ab, unter dem Schlüssel <span class=\"mono\">fintest_orig_name</span>. Der Wert bleibt dort, bis du ihn unten löschst oder die Websitedaten entfernst. Er verlässt dein Gerät nicht: diese Seite darf laut ihrer eigenen Sicherheitsregel überhaupt keine Verbindung nach außen aufbauen.",
    btnForget: "Gemerkte FIN aus dem Browser löschen",
    finDanger: "<b>Nach dem Schreiben bricht die Verbindung ab.</b> Die Steuerung gibt den neuen Namen an das Bluetooth-Modul weiter und das startet die Werbung neu. Das ist erwartet: einmal neu verbinden, dann steht der neue Name in der Liste.",

    frameTitle: "Gesendeter Befehl",
    frameHint: "Die 20 Bytes, die zuletzt über Bluetooth hinausgegangen sind, als Hex. Aufbau: <b>AA</b> Anfang, <b>1F</b> Befehl für die FIN, dann 16 Namensbytes in ASCII mit Leerzeichen aufgefüllt, ein unbenutztes <b>FF</b> und am Ende die Prüfsumme CRC-8. Damit lässt sich gegen die Firmware prüfen, ob hier derselbe Befehl herausgeht wie aus der App.",

    logTitle: "Protokoll",
    logPublic: "Öffentliches Protokoll (anonymisiert)",
    logDiag: "Diagnose (ausführlich)",
    btnCopyLog: "Kopieren",
    btnClearLog: "Leeren",
    btnSaveLog: "Speichern",
    logHint: "<span class=\"log-tx\">TX - gesendet</span>, <span class=\"log-rx\">RX - empfangen</span>. Das Protokoll ist technisch (Englisch/ASCII), unabhängig von der Sprache der Seite. Anonymisiert werden Geräte-ID, MAC und lange Hex-Werte.",

    footGuide: "Anleitung",
    footSource: "Quellcode",
    footReadme: "Readme",
    footDisclaimer: "Haftungsausschluss",
    footLicense: "Lizenz",
    footPrivacy: "Datenschutz",
    footTrademarks: "Marken",
    docClose: "Schließen",

    stDisconnected: "getrennt",
    stChoosing: "wählen ...",
    stConnecting: "verbinden ...",
    stConnected: "verbunden",
    stWriting: "schreiben ...",
    stStale: "Seite veraltet",
    noName: "(ohne Namen)",
    docLoading: "wird geladen ...",
    docFail: "Das Dokument konnte nicht geladen werden.",

    node50: "50  TFT-40 Display",
    node60: "60  LCD-43 Display",
    node70: "70  Lichtmodul",
    node30: "30  Controller hinten",
    node31: "31  Controller vorn",
    node10: "10  BMS"
  },

  en: {
    brandSub: "Blade-Test",
    langGroup: "Language",
    themeToLight: "Switch to light theme",
    themeToDark: "Switch to dark theme",

    s1Title: "What this is for",
    about1: "Connect and write the scooter's FIN, nothing more. The list shows devices whose name starts with <b>TDE</b>, <b>T1</b> or <b>TEU</b>. The start is checked, so <b>TDE1</b>, <b>T1DE</b> and <b>TEU1</b> are included too. This page does not ask which model is behind it.",
    about2: "The FIN is the scooter's Bluetooth name. It is stored in the controller's EEPROM and survives a restart. Write down the original value before you change it.",
    about3: "<b>Feasibility study:</b> this page shows what the Bluetooth protocol of a kick scooter makes technically possible, it is not a finished product. Flawless operation is not promised, there is no warranty of any kind. Everything you do here is at your own risk. <a href=\"#\" data-doc=\"DISCLAIMER\">Read the disclaimer</a>. Please report problems or bugs while testing via DM to Laufbursche in the escooter-stammtisch or as a GitHub issue. This tool does not tune, derestrict or unlock anything: it only writes the device identity (the FIN, i.e. the Bluetooth name) and checks whether assemblies are reachable behind the Bluetooth link. Changing the FIN unlocks nothing, because on a Laufbursche firmware the throttle limit hangs on the Bluetooth lock, not on the name.",

    connTitle: "Connection",
    btnConnect: "Connect",
    btnDisconnect: "Disconnect",
    lblDevice: "Device:",
    lblService: "Service:",
    connHint: "Runs in Chrome on Android or on a computer and in Bluefy on iOS. Safari has no Web Bluetooth.",

    profTitle: "Device profile",
    profHint1: "What the Bluetooth module reveals about itself: every offered service, every characteristic with its capabilities, plus the standard device information service <span class=\"mono\">180A</span> in clear text, that is manufacturer, model and revisions. Fills in by itself on connect.",
    profHint2: "Reading is done exclusively from <span class=\"mono\">180A</span>, because that service exists precisely for it. Nothing is read from unknown vendor characteristics, because a read there could trigger something. The browser blocks the serial number on its own, that is not a fault.",
    btnProfCopy: "Copy profile",

    lockTestTitle: "Lock test: record locked versus unlocked",
    lockTestIntro: "This is the actual test. Goal: find out at which <b>byte</b> the scooter permanently indicates whether it is limited (22) or free (65). Cruise control is no good for this, because on the Blade it jumps straight back to off. <b>Nothing is sent</b>, the page only reads along.",
    lockStep1: "<b>Connect</b> (card above). Let it stream for a few seconds.",
    lockStep2: "Put the scooter into the <b>locked</b> state (22). Wait around 10 seconds so <span class=\"mono\">55 71</span> reliably comes through.",
    lockStep3: "<b>Unlock</b> the scooter with your previously working method (65). Wait around 10 seconds again.",
    lockStep4: "Tap <b>Copy inventory</b> below and send me the whole text.",
    lockTestNote: "Because the page keeps <b>every differing variant</b> of a frame separately, <span class=\"mono\">55 71</span> then has two variants (locked and unlocked). The new line <b>DIFF across variants</b> then shows exactly the byte that differs and stays. Pay special attention to <span class=\"mono\">Byte17 system status</span>, <span class=\"mono\">Bit6</span> and <span class=\"mono\">speed limit</span>. Take care <b>not to change gear</b> during the recording, otherwise byte3 changes too.",

    cruiseTitle: "Send cruise control (unlock/lock on this page)",
    cruiseWarn: "Bluetooth is exclusive: you cannot be connected to the Teverun app at the same time. That is why these buttons send the cruise-control command directly from here. The normal <span class=\"mono\">0x18</span> settings frame goes out, all other values are mirrored unchanged from the last <span class=\"mono\">55 71</span>, only cruise control changes.",
    btnUnlockAuto: "Unlock: cruise auto (1)",
    btnUnlockMan: "Unlock: cruise manual (2)",
    btnLockCruise: "Lock: cruise off (0)",
    cruiseNote: "The cruise command flips the clamp in the ESC - that is the <b>action</b> for unlocking and locking, and it is fixed. For <b>detecting</b> whether the Blade is locked, the cruise value is no good, because it falls back to off immediately. So these buttons only toggle the state back and forth, so the <b>DIFF</b> line on <span class=\"mono\">55 71</span> shows which byte carries the state <b>permanently</b>. Sequence: first <b>Connect</b> and wait until the buttons become active; then send <b>cruise off</b> and check via live cam (limited?); then <b>cruise auto</b> (free?); afterwards <b>Copy inventory</b> above and send it to me.",

    reqTitle: "Request assembly info (proType / proCode)",
    reqHint: "The frames <span class=\"mono\">55 44</span> (display/battery/light) and <span class=\"mono\">55 45</span> (motor controller = Blade ESC) do not stream on their own - they are answers to a request. This button sends the request frames; the answers then appear below in the inventory with proType and proCode. That is how we find the real firmware key of the Blade ESC.",
    btnReqInfo: "Request assembly info",

    invTitle: "What answers us here",
    invIntro: "For this <b>nothing is sent</b>. The scooter reports on its own which assemblies it knows, with type, code and version. This page only reads along. The list fills in by itself after connecting, some entries only come after a few seconds.",
    invNote: "<b>not reported</b> means the remote end sends only filler bytes for this assembly. It then knows nothing about it itself, no matter what is fitted. Below the overview each received frame type is listed separately, and within it <b>every differing variant on its own</b> with its frequency: first the raw bytes, below them the fields, as far as known. A frame type that nobody here decodes still stays visible.",
    btnInvCopy: "Copy inventory",

    probeTitle: "Node query",
    probeIntro: "Asks an assembly whether it is reachable behind this Bluetooth link and whether it could accept an update. It <b>only asks</b>. The command that actually begins an update is a different one and appears nowhere in this page.",
    lblNode: "Assembly",
    btnProbe: "Query",
    btnProbeAll: "Query all one after another",
    probeWarn: "<b>What we are looking for.</b> Even <i>any</i> valid answer proves that the remote end behind Bluetooth speaks this update protocol at all. A \"project code does not match\" additionally proves that the named assembly is reachable and could be flashed. If everything stays silent, this path does not exist on this device.",
    probeNote: "The request deliberately names a project code that no assembly can have. That makes the friendliest possible answer \"code does not match\", and an accidental yes cannot happen.",
    btnProbeCopy: "Copy report",

    finTitle: "Write FIN",
    lblNewFin: "New FIN",
    finPhIdle: "connect first",
    finPhConnected: "e.g. T1DE0000000000",
    btnWrite: "Write",
    btnRestore: "Write back original FIN",
    finHint1: "At most 16 characters, ASCII only. The first character must be printable, the controller checks it against the range 0x30 to 0x7A. Shorter names are padded with spaces by the command, just like the firmware itself.",
    finRemembered: "Remembered on connect:",
    finWarn: "<b>This page stores your FIN in the browser.</b> So that \"Write back original FIN\" still knows what to reset to after a reload, the page stores the name read on the first connect in your browser's local storage, under the key <span class=\"mono\">fintest_orig_name</span>. The value stays there until you delete it below or clear the site data. It does not leave your device: by its own security rule this page may not open any outbound connection at all.",
    btnForget: "Delete remembered FIN from the browser",
    finDanger: "<b>The link drops after writing.</b> The controller hands the new name to the Bluetooth module and that restarts advertising. This is expected: reconnect once, then the new name appears in the list.",

    frameTitle: "Sent command",
    frameHint: "The 20 bytes that last went out over Bluetooth, as hex. Layout: <b>AA</b> start, <b>1F</b> command for the FIN, then 16 name bytes in ASCII padded with spaces, one unused <b>FF</b> and at the end the CRC-8 checksum. This lets you check against the firmware whether the same command goes out here as from the app.",

    logTitle: "Protocol log",
    logPublic: "Public log (anonymized)",
    logDiag: "Diagnostics (verbose)",
    btnCopyLog: "Copy",
    btnClearLog: "Clear",
    btnSaveLog: "Save",
    logHint: "<span class=\"log-tx\">TX - sent</span>, <span class=\"log-rx\">RX - received</span>. The log is technical (English/ASCII), independent of the page language. Device ID, MAC and long hex values are anonymized.",

    footGuide: "Guide",
    footSource: "Source",
    footReadme: "Readme",
    footDisclaimer: "Disclaimer",
    footLicense: "License",
    footPrivacy: "Privacy",
    footTrademarks: "Trademarks",
    docClose: "Close",

    stDisconnected: "disconnected",
    stChoosing: "choosing ...",
    stConnecting: "connecting ...",
    stConnected: "connected",
    stWriting: "writing ...",
    stStale: "page outdated",
    noName: "(no name)",
    docLoading: "loading ...",
    docFail: "The document could not be loaded.",

    node50: "50  TFT-40 display",
    node60: "60  LCD-43 display",
    node70: "70  Light module",
    node30: "30  Rear controller",
    node31: "31  Front controller",
    node10: "10  BMS"
  }
};

// Current language, persisted per viewer. German is the default.
let lang = 'de';
const LS_LANG = 'fintest_lang';
try { const s = localStorage.getItem(LS_LANG); if (s === 'de' || s === 'en') lang = s; } catch (e) {}

function table() { return (window.I18N && window.I18N[lang]) || {}; }
function t(key) { const v = table()[key]; return (typeof v === 'string') ? v : ''; }

// Fill every [data-t] element and [data-t-ph] placeholder from the active table. A value that
// carries markup is set via innerHTML; the values are our own strings, never user input.
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach((n) => {
    const v = t(n.getAttribute('data-t'));
    if (/[<&]/.test(v)) n.innerHTML = v; else n.textContent = v;   // scan-ok: own i18n table, not user input
  });
  document.querySelectorAll('[data-t-ph]').forEach((n) => {
    const v = t(n.getAttribute('data-t-ph'));
    if (v) n.setAttribute('placeholder', v);
  });
  { const el = document.getElementById('langs'); if (el) el.setAttribute('aria-label', t('langGroup')); }
  document.querySelectorAll('#langs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  // Theme button label follows the current theme and language.
  { const dark = document.documentElement.getAttribute('data-theme') !== 'light'; const el = document.getElementById('btn-theme'); if (el) { el.setAttribute('aria-label', t(dark ? 'themeToLight' : 'themeToDark')); el.title = el.getAttribute('aria-label'); } }
}

function initLangSwitch() {
  document.querySelectorAll('#langs button').forEach((b) => b.addEventListener('click', () => {
    lang = b.dataset.lang;
    try { localStorage.setItem(LS_LANG, lang); } catch (e) {}
    applyLang();
  }));
}
