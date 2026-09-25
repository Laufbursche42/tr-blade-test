# Guide: Laufbursche Blade test

> **Test tool, not a tuning tool.** This page is a feasibility study, not a finished product. It does not tune, derestrict or unlock any scooter. It only writes the device identity (the FIN) and tests whether assemblies are reachable behind Bluetooth. Error-free operation is not promised, there is no warranty of any kind. Whatever you do here, you do at your own risk.

## 1. What you need

Everything happens in the browser over Web Bluetooth, there is nothing to install. All you need is:

- **iOS:** the **Bluefy** browser (free on the App Store). Safari and every other iOS browser run on the Safari engine, which has no Web Bluetooth.
- **Android or desktop:** **Chrome** or another Chromium browser. Web Bluetooth is built in.
- **A Teverun Blade.** The chooser lists only devices whose name starts with `TDE`, `T1` or `TEU` (so `TDE1`, `T1DE`, `TEU1` are included too). The page does not ask which model is behind that name.

---

## 2. Connect

Tap **Connect** and pick your scooter from the browser's chooser. After connecting, the **device profile** fills in on its own: every service on offer, every characteristic, and the standard device information service `180A` in clear text (manufacturer, model, revisions). Only `180A` is read, because that service exists to be read; nothing is read from unknown vendor characteristics, since a read there could trigger something.

The first-ever connect always needs the browser's chooser. That is a browser security rule.

---

## 3. Write the FIN

The **FIN** is the Bluetooth name the scooter advertises and, at the same time, its device identity. On connect the page remembers the name it read as the original, in the browser's local storage under the key `fintest_orig_name`.

- **Write:** up to 16 characters, ASCII only. The first character must be in the range 0x30 to 0x7A, or the controller rejects it. Shorter names are space-padded by the command, exactly as the firmware pads them.
- **Restore original FIN:** resets to the value remembered on the first connect.
- **Forget remembered FIN:** removes the value from the browser again.

After the write the link drops: the controller hands the new name to the Bluetooth module, which restarts advertising. Reconnect once and the new name is in the list. The value survives a restart because it lives in the controller's EEPROM. **Write the original value down before you change it.**

Changing the FIN unlocks nothing. On a Laufbursche firmware the speed clamp hangs off the live Bluetooth lock, not off the name.

---

## 4. Reach and probe assemblies

The actual test is the **node probe**: it asks an assembly whether it is reachable behind this Bluetooth link and whether it could accept an update. It only **asks**. The command that actually begins an update is a different one and appears nowhere on this page. The query deliberately names an impossible project code, so there can be no accidental yes.

- Any well-formed answer at all proves the peer behind Bluetooth speaks the update protocol.
- A "project code does not match" additionally proves the named assembly is reachable.
- If everything stays silent, this path does not exist on this device.

**Probe all in turn** walks through every assembly. The report under the card can be copied.

**Request assembly info** sends the request frames so the answers `55 44` / `55 45` / `55 4d` (proType and proCode per assembly) show up in the inventory. The **What answers us** card only reads along; it shows each received frame type separately, and within it each distinct variant on its own.

---

## 5. Record a lock test (read-only)

The **lock test** card helps find the byte at which the scooter permanently shows whether it is limited or open. Connect, let it stream briefly, put the scooter into the locked and then the unlocked state, wait about 10 seconds each time, then **copy the inventory**. The **DIFF across variants** line on `55 71` then shows the byte that differs and stays.

Because cruise falls back to off on the Blade at once, the buttons under **Send cruise** send the command straight from here: the normal `0x18` settings frame, all other values mirrored from the last `55 71`. That only serves to flip the state back and forth for the DIFF comparison.

---

## 6. The log

The log card shows every sent (**TX**) and received (**RX**) frame as hex with a timestamp. The transcript is technical and kept in English/ASCII, independent of the page's language.

- **Public log (anonymized)** is on by default: the device id, MAC addresses and long hex runs are masked before you copy, save or show the log.
- **Diagnostics (verbose)** additionally records the keep-alive frames and the running telemetry.
- **Copy**, **Clear** and **Save** all work on the same, anonymized text.

Turn the public log off only when you need the raw log locally for debugging, and do not share it then.

---

## 7. Limits and law

- **No background operation.** The link lives only while the page is open and in the foreground.
- **Nothing leaves your device** but loading the page and its own documents. Details in the [Privacy policy](PRIVACY.md).
- Read the [Disclaimer](DISCLAIMER.md) in full before you write an identity.
