# Privacy Policy

This web app is built to keep your data on your device. This policy explains exactly what it does and does not do with your data.

## The short version

The app collects nothing. There are no accounts, no analytics, no telemetry, no tracking, no ads, no cookies and no third-party scripts. Nothing is ever sent to the developer or to any manufacturer backend.

## What data the app handles and where it stays

All of the following stays on your device and is never uploaded anywhere:

- Live scooter telemetry read over Bluetooth LE (speed, wheel size, gear, pack voltage, the FIN, per-assembly identity, etc.).
- The remembered original FIN: the advertised name read on the first connect, kept in the browser's `localStorage` under the key `fintest_orig_name` so the "restore original FIN" button still knows what to write back after a reload. It stays on your device until you delete it with the on-screen button or clear the site data.
- The on-screen log. It exists only in the open page during your session, is never stored and is never uploaded.

## The only network connections

The app makes network connections in exactly two cases and no others:

### 1. Loading the page and its own documents

When you open or reload the page, your browser fetches the static files (`index.html`, `app.js`, `styles.css`) from the host (for example GitHub Pages). Opening a document from the footer (guide, license, privacy, trademarks, disclaimer, readme) fetches that Markdown file from the same host. Both are ordinary same-origin requests to the site itself: the content security policy is `connect-src 'self'`, so the page cannot open any outbound connection to a different server. The host sees only your **IP address** and which file you requested, the normal web-server logs every website has. It **never** sees any scooter data, settings or the FIN. That data never reaches any server at all.

### 2. Bluetooth LE to your scooter

A local radio link to your scooter over Web Bluetooth. This is not an internet connection, so no data leaves your device over the network for this. Telemetry, the FIN write and the node-reachability queries travel only between your browser and the scooter.

## No developer or manufacturer backend

Nothing is ever sent to the developer or to any manufacturer backend. There is no cloud account and no server operated by this project that receives your data. For comparison: the original Teverun app uploads GPS, rides and error codes to the manufacturer backend. This app does none of that.

## Contact

For privacy questions, contact the author (Laufbursche) on GitHub: https://github.com/Laufbursche42
