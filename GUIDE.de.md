# Anleitung: Laufbursche Blade-Test

> **Testwerkzeug, kein Tuning-Werkzeug.** Diese Seite ist eine Machbarkeitsstudie, kein fertiges Produkt. Sie tunt, entdrosselt oder entsperrt keinen Roller. Sie schreibt nur die Geräte-Identität (die FIN) und prüft, ob Baugruppen hinter Bluetooth erreichbar sind. Fehlerfreier Betrieb wird nicht versprochen, es gibt keinerlei Gewährleistung. Was du hier tust, tust du auf eigenes Risiko.

## 1. Was du brauchst

Alles passiert im Browser über Web Bluetooth, es gibt nichts zu installieren. Gebraucht wird:

- **iOS:** den Browser **Bluefy** (kostenlos im App Store). Safari und jeder andere iOS-Browser laufen auf der Safari-Engine, die kein Web Bluetooth hat.
- **Android oder Desktop:** **Chrome** oder einen anderen Chromium-Browser. Web Bluetooth ist eingebaut.
- **Einen Teverun Blade.** Die Auswahl zeigt nur Geräte, deren Name mit `TDE`, `T1` oder `TEU` beginnt (also auch `TDE1`, `T1DE`, `TEU1`). Welches Modell dahinter steckt, fragt diese Seite nicht.

---

## 2. Verbinden

Tippe auf **Verbinden** und wähle deinen Roller in der Liste des Browsers. Nach dem Verbinden füllt sich der **Gerätesteckbrief** von selbst: alle angebotenen Dienste, alle Charakteristiken und der genormte Geräteinformations-Dienst `180A` im Klartext (Hersteller, Modell, Stände). Gelesen wird ausschließlich aus `180A`, weil dieser Dienst genau dafür da ist; von unbekannten Hersteller-Charakteristiken wird nichts gelesen, weil ein Lesezugriff dort etwas auslösen könnte.

Das allererste Verbinden braucht immer die Auswahl des Browsers. Das ist eine Sicherheitsregel des Browsers.

---

## 3. Die FIN schreiben

Die **FIN** ist der Bluetooth-Name, den der Roller ausstrahlt, und zugleich seine Geräte-Identität. Beim Verbinden merkt sich die Seite den gelesenen Namen als den ursprünglichen, im lokalen Speicher des Browsers unter dem Schlüssel `fintest_orig_name`.

- **Schreiben:** höchstens 16 Zeichen, nur ASCII. Das erste Zeichen muss im Bereich 0x30 bis 0x7A liegen, die Steuerung lehnt es sonst ab. Kürzere Namen füllt der Befehl mit Leerzeichen auf, so wie die Firmware selbst.
- **Ursprüngliche FIN zurückschreiben:** setzt auf den beim ersten Verbinden gemerkten Wert zurück.
- **Gemerkte FIN löschen:** entfernt den Wert wieder aus dem Browser.

Nach dem Schreiben bricht die Verbindung ab: die Steuerung gibt den neuen Namen an das Bluetooth-Modul weiter, das die Werbung neu startet. Einmal neu verbinden, dann steht der neue Name in der Liste. Der Wert überlebt den Neustart, weil er im EEPROM der Steuerung liegt. **Schreib dir den ursprünglichen Wert auf, bevor du ihn änderst.**

Die FIN zu ändern schaltet nichts frei. Auf einer Laufbursche-Firmware hängt die Drossel am Bluetooth-Schloss, nicht am Namen.

---

## 4. Baugruppen erreichen und prüfen

Der eigentliche Test ist die **Node-Abfrage**: Sie fragt eine Baugruppe, ob sie hinter dieser Bluetooth-Verbindung erreichbar ist und ob sie ein Update annehmen könnte. Es wird **nur gefragt**. Der Befehl, der ein Update tatsächlich beginnt, ist ein anderer und steht in dieser Seite nirgends. Die Anfrage nennt absichtlich einen unmöglichen Projektcode, so kann es kein versehentliches Ja geben.

- Schon **irgendeine** gültige Antwort beweist, dass die Gegenstelle hinter Bluetooth das Update-Protokoll überhaupt spricht.
- Ein "Projektcode passt nicht" beweist zusätzlich, dass die genannte Baugruppe erreichbar ist.
- Bleibt alles still, gibt es diesen Weg auf diesem Gerät nicht.

Mit **Alle nacheinander abfragen** gehst du alle Baugruppen durch. Das Protokoll unter der Karte lässt sich kopieren.

**Baugruppen-Info anfordern** sendet die Anforderungs-Frames, damit die Antworten `55 44` / `55 45` / `55 4d` (proType und proCode je Baugruppe) im Inventar erscheinen. Die Karte **Was antwortet uns da** liest nur mit; sie zeigt jede empfangene Rahmenart einzeln, darin jede abweichende Ausprägung eigen.

---

## 5. Sperr-Test aufnehmen (nur mitlesen)

Die Karte **Sperr-Test** hilft, das Byte zu finden, an dem der Roller dauerhaft anzeigt, ob er gedrosselt oder frei ist. Verbinden, kurz streamen lassen, den Roller in den gesperrten und dann in den entsperrten Zustand bringen, jeweils rund 10 Sekunden warten, dann das **Inventar kopieren**. Die Zeile **DIFF über Ausprägungen** bei `55 71` zeigt dann das Byte, das sich unterscheidet und bleibt.

Weil sich der Tempomat am Blade sofort auf Aus zurückstellt, senden die Knöpfe unter **Tempomat senden** den Befehl direkt von hier: der normale `0x18`-Einstellungsrahmen, alle übrigen Werte aus dem letzten `55 71` gespiegelt. Das ist nur dazu da, den Zustand für den DIFF-Vergleich hin und her zu schalten.

---

## 6. Das Protokoll

Die Protokoll-Karte zeigt jeden gesendeten (**TX**) und empfangenen (**RX**) Rahmen als Hex mit Zeitstempel. Das Protokoll ist technisch und in Englisch/ASCII gehalten, unabhängig von der Sprache der Seite.

- **Öffentliches Protokoll (anonymisiert)** ist standardmäßig an: Geräte-ID, MAC-Adressen und lange Hex-Werte werden maskiert, bevor du das Protokoll kopierst, speicherst oder zeigst.
- **Diagnose (ausführlich)** nimmt zusätzlich die Keep-alive-Rahmen und die laufende Telemetrie mit auf.
- **Kopieren**, **Leeren** und **Speichern** arbeiten alle mit demselben, anonymisierten Text.

Schalte das öffentliche Protokoll nur aus, wenn du das Rohprotokoll lokal zur Fehlersuche brauchst, und teile es dann nicht.

---

## 7. Grenzen und Recht

- **Kein Hintergrundbetrieb.** Die Verbindung lebt nur, solange die Seite offen und im Vordergrund ist.
- **Nichts verlässt dein Gerät** außer dem Laden der Seite und ihrer eigenen Dokumente. Einzelheiten in der [Datenschutzerklärung](PRIVACY.de.md).
- Lies den [Haftungsausschluss](DISCLAIMER.de.md) vollständig, bevor du eine Identität schreibst.
