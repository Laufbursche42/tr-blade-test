# Datenschutzerklärung

Diese Webanwendung ist darauf gebaut, deine Daten auf deinem Gerät zu halten. Diese Erklärung sagt genau, was sie mit deinen Daten tut und was nicht.

## Kurz gefasst

Die Anwendung sammelt nichts. Es gibt keine Anmeldung, keine Statistik, keine Telemetrie, keine Verfolgung, keine Werbung, keine Cookies und keine Skripte von Dritten. Nichts geht an den Entwickler oder an ein Backend des Herstellers.

## Welche Daten die Anwendung verarbeitet und wo sie bleiben

Alles Folgende bleibt auf deinem Gerät und wird nirgendwohin hochgeladen:

- Die Telemetrie des Scooters, live über Bluetooth LE gelesen: Geschwindigkeit, Radgröße, Gang, Pack-Spannung, die FIN, die Kennung je Baugruppe und so weiter.
- Die gemerkte ursprüngliche FIN: der beim ersten Verbinden gelesene ausgestrahlte Name, abgelegt im `localStorage` des Browsers unter dem Schlüssel `fintest_orig_name`, damit der Knopf "Ursprüngliche FIN zurückschreiben" auch nach einem Neuladen noch weiß, worauf zurückzusetzen ist. Der Wert bleibt auf deinem Gerät, bis du ihn mit dem Knopf auf der Seite löschst oder die Websitedaten entfernst.
- Das Protokoll auf dem Bildschirm. Es lebt nur in der offenen Seite während deiner Sitzung, wird nicht gespeichert und nicht hochgeladen.

## Die einzigen Netzverbindungen

Die Anwendung baut in genau zwei Fällen eine Verbindung auf, in keinem anderen:

### 1. Laden der Seite und ihrer eigenen Dokumente

Wenn du die Seite öffnest oder neu lädst, holt dein Browser die statischen Dateien (`index.html`, `app.js`, `styles.css`) vom Anbieter, zum Beispiel GitHub Pages. Öffnest du ein Dokument aus der Fußleiste (Anleitung, Lizenz, Datenschutz, Marken, Haftungsausschluss, Readme), holt der Browser diese Markdown-Datei vom selben Anbieter. Beides sind gewöhnliche Anfragen an dieselbe Herkunft, also an die Seite selbst: Die Sicherheitsregel lautet `connect-src 'self'`, die Seite kann also überhaupt keine Verbindung zu einem fremden Server aufbauen. Der Anbieter sieht nur deine **IP-Adresse** und welche Datei du abgerufen hast, die üblichen Zugriffsprotokolle, die jede Website hat. Er sieht **nie** Daten des Scooters, Einstellungen oder die FIN. Diese Daten erreichen überhaupt keinen Server.

### 2. Bluetooth LE zum Scooter

Eine lokale Funkverbindung zu deinem Scooter über Web Bluetooth. Das ist keine Internetverbindung, dafür verlassen keine Daten dein Gerät über das Netz. Telemetrie, das Schreiben der FIN und die Node-Erreichbarkeitsabfragen laufen ausschließlich zwischen deinem Browser und dem Scooter.

## Kein Backend des Entwicklers oder des Herstellers

Nichts geht an den Entwickler oder an ein Backend des Herstellers. Es gibt kein Konto in einer Cloud und keinen Server dieses Projekts, der deine Daten annimmt. Zum Vergleich: die Original-App von Teverun lädt Standortdaten, Fahrten und Fehlercodes zum Backend des Herstellers. Diese Anwendung tut nichts davon.

## Kontakt

Bei Fragen zum Datenschutz wende dich an den Autor (Laufbursche) auf GitHub: https://github.com/Laufbursche42
