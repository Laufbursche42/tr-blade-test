# Laufbursche Blade-Test

**Die Seite: https://laufbursche42.github.io/tr-blade-test/**

Ein einseitiges Testwerkzeug. Es verbindet sich über Web Bluetooth mit einem Roller und schreibt die Geräte-Identität, also den String, den die Laufbursche-App die FIN nennt und den das Bluetooth-Modul als seinen Namen ausstrahlt. Außerdem fragt es einzelne Baugruppen, ob sie hinter dieser Bluetooth-Verbindung erreichbar sind.

**Absichtlich modellunabhängig.** Die Auswahl zeigt Geräte, deren ausgestrahlter Name mit `TDE`, `T1` oder `TEU` beginnt, was auch `TDE1`, `T1DE` und `TEU1` einschließt. Das ist eine Roller-Identität, mehr wird an diesem Namen nicht geprüft. Es gibt keine Modell-Sperre, die Identität lässt sich also auch an einem Roller schreiben, den die App nicht kennt.

> **Kein Tuning-Werkzeug.** Diese Seite tunt, entdrosselt oder entsperrt keinen Roller. Sie schreibt nur die Geräte-Identität (die FIN, also den ausgestrahlten BLE-Namen) und prüft, ob Baugruppen hinter der Bluetooth-Verbindung erreichbar sind. Die FIN zu ändern schaltet nichts frei: auf einer Laufbursche-Firmware hängt die Drossel am Bluetooth-Schloss, nicht am Namen.

## Was es kann

- Verbinden und Trennen, mit dem Handschlag und dem Keep-alive, das die App sendet.
- Den ausgestrahlten Namen zeigen, der die Identität ist, und ihn als Wert zum Zurückschreiben merken.
- Eine neue Identität schreiben, höchstens 16 ASCII-Zeichen, mit Leerzeichen aufgefüllt wie die Firmware.
- Die gemerkte Identität wieder zurückschreiben und den gemerkten Wert wieder löschen.
- Eine Baugruppe fragen, ob sie erreichbar ist und ein Update annehmen könnte, ohne Firmware zu senden.
- Den gesendeten Rahmen zeigen, damit er gegen die Firmware geprüft werden kann.
- Ein vollständiges Protokoll führen: gesendete und empfangene Rahmen als Hex mit Zeitstempel, ein öffentliches (anonymisiertes) und ein ausführliches Diagnose-Protokoll, dazu Kopieren, Leeren und Speichern.

**Anleitung: [Deutsch](GUIDE.de.md) | [English](GUIDE.en.md)** führt Karte für Karte durch die Seite.

## Was es speichert

Damit "Ursprüngliche FIN zurückschreiben" auch nach einem Neuladen weiß, worauf zurückzusetzen ist, legt die Seite den beim ersten Verbinden gelesenen Namen im `localStorage` des Browsers unter dem Schlüssel `fintest_orig_name` ab. Nichts vom Roller verlässt dein Gerät: Die Sicherheitsregel der Seite lautet `connect-src 'self'`, sie darf also ihre eigenen Dokumente (Anleitung, Lizenz, Datenschutz und so weiter) vom selben Anbieter holen, aber keine Verbindung zu einem fremden Server aufbauen.

## Recht

Dies ist eine Machbarkeitsstudie, kein fertiges Produkt, und ein Testwerkzeug, kein Tuning-Werkzeug. Lies den [Haftungsausschluss](DISCLAIMER.de.md) vollständig, bevor du eine Identität schreibst. Kurz gefasst: die Identität eines Rollers zu ändern kann seine Betriebserlaubnis berühren, es gibt keinerlei Gewährleistung, und alles, was du hier tust, tust du auf eigenes Risiko.

## Lizenz

PolyForm Noncommercial 1.0.0 mit zwei Zusatzbedingungen, im Wortlaut in [Lizenz](LICENSE.de.md).

## Datenschutz

Nichts vom Roller verlässt dein Gerät; die Seite holt nur ihre eigenen Dateien von ihrem Anbieter. Einzelheiten in der [Datenschutzerklärung](PRIVACY.de.md).

## Marken

Ein unabhängiges Projekt, ohne Verbindung zu Teverun. "Teverun", "HobbyWing" und andere Produktnamen sind Marken ihrer jeweiligen Inhaber und werden hier nur genannt, um zu sagen, mit welchen Rollern diese Seite arbeitet. Siehe [Marken](TRADEMARKS.de.md).

## Browser

Chrome auf Android oder Desktop und Bluefy auf iOS. Safari hat überhaupt kein Web Bluetooth.
