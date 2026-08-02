# Laufbursche Blade Test

**The page: https://laufbursche42.github.io/tr-blade-test/**

A one-page test tool. It connects to a scooter over Web Bluetooth and writes the VCU identity, the string the Laufbursche app calls the FIN and the Bluetooth module advertises as its name. It also asks single assemblies whether they are reachable behind that Bluetooth link.

**Model-independent on purpose.** The chooser lists devices whose advertised name starts with `TDE`, `T1` or `TEU`, which also covers `TDE1`, `T1DE` and `TEU1`, which is a scooter identity and nothing beyond that name is checked. There is no model gate, so the identity write can be tried on a scooter the app does not know.

## What it does

- connect and disconnect, with the handshake and the keep-alive the app sends. The chooser is filtered to a name starting with `TDE`, `T1` or `TEU`
- show the advertised name, which is the identity, then remember it as the value to write back
- write a new identity, up to 16 ASCII characters, space-padded exactly as the firmware pads it
- write the remembered identity back
- ask a single assembly whether it is reachable and whether it would take an update, without sending any firmware
- print the frame that went out, so it can be checked against the firmware
- forget the remembered identity again

## What it stores

Writing the original identity back has to survive a reload, so the page keeps it in `localStorage` under the key `fintest_orig_name`. It is written on the first connect and read on every load. The page says so on screen and offers a button that deletes it again. Nothing leaves the device: the page carries `connect-src 'none'` in its own content security policy, so it cannot open an outbound connection at all.

The remembered value is the one from the first connect and is not replaced later. On a second scooter the restore button would therefore write the first scooter's identity. Delete the stored value before connecting a different scooter.

## The identity frame

`cmd 0x1F`, a byte-for-byte port of `CommandBuilder.setDeviceName` in the Laufbursche Edition app:

```
AA 1F <16 ASCII name bytes, space-padded> FF <CRC-8>
```

CRC-8 with polynomial 0x07 over the first 19 bytes. Byte 18 stays `0xFF`, because the handler reads only the 16 name bytes. The controller copies them into the identity in RAM, persists them to its EEPROM and hands them to the Bluetooth module.

The port is verified against the app: the four methods were compiled out of `CommandBuilder.java` and produce the same bytes for the same input.

## What the identity does

The first three characters gate the eKFV speed clamp in the stock firmware: an identity starting with `TDE` is the limited one. On a Laufbursche firmware the clamp hangs off the live Bluetooth lock instead, so renaming does not unlock anything there.

The value survives a restart because it lives in the controller's EEPROM. Write the original down before you change it.

## The node probe

The vendor app's ver2 update path opens with a handshake that names a target assembly and the project code of the file. The assembly answers before anything is erased. The command that actually begins a flash is a separate one this page never builds. That makes the question askable on its own.

One question is one frame of twelve bytes:

```
BB 06 E2 01 <node> <project code> 00 00 00 00 <sum> <CRC-8>
```

`BB` header, `06 E2` handshake id, `01` request subcommand, the node byte, the project code, four filler bytes, the sum over the seven payload bytes, CRC-8 over the ten bytes between header and checksum.

The six assemblies, with the frame each button sends:

```
50   TFT-40 display        BB 06 E2 01 32 00 00 00 00 00 33 E7
60   LCD-43 display        BB 06 E2 01 3C 00 00 00 00 00 3D EB
70   light module          BB 06 E2 01 46 00 00 00 00 00 47 EE
30   rear controller       BB 06 E2 01 1E 00 00 00 00 00 1F 1D
31   front controller      BB 06 E2 01 1F 00 00 00 00 00 20 7F
10   BMS                   BB 06 E2 01 0A 00 00 00 00 00 0B D7
```

### Why it cannot flash anything

Two independent reasons. The start command `07 80` appears nowhere in this page. And the request carries project code `00` on purpose, so the friendliest reachable answer is "project code does not match". An accidental yes is not one of the possible outcomes.

### Reading the answers

An answer is `CC 06 EA` followed by the result. The codes are the app's own:

```
no answer at all   the peer does not know this protocol
55 01              node does not exist, but the peer speaks the protocol
55 02              node is there, no update path
55 03              project code does not match, so the node is there and could be flashed
55 04              node is there, busy right now
AA                 node would accept, but the page stops here
```

The finding that matters sits one level above the individual codes: any well-formed `CC 06 EA` answer proves the peer behind Bluetooth speaks the node protocol at all.

### The report

"Protokoll kopieren" produces a plain text block with the FIN, the service UUID, the notify UUID, the project code that was asked with, the sent and received frame per node with its reading, plus a conclusion.

### Verification

The frame builder is not a reconstruction. A literal port of the vendor app's hex-string version produces byte-identical frames across all six nodes and four project codes.

## Before you use it

Use at your own risk. See the warnings the page itself shows.

## Browser

Chrome on Android or desktop and Bluefy on iOS. Safari has no Web Bluetooth at all, so a home-screen bookmark made in Safari cannot work.
