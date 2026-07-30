# Laufbursche FIN test

A one-page test tool. It connects to a scooter over Web Bluetooth and writes the VCU identity, the string the Laufbursche app calls the FIN and the Bluetooth module advertises as its name. Nothing else.

**Model-independent on purpose.** The chooser offers every Bluetooth device, there is no name filter and no model check, and the write goes to whatever accepted the link. That is what this tool is for: trying the identity write on a scooter the app does not know.

## What it does

- connect and disconnect, with the handshake and the keep-alive the app sends
- show the advertised name, which is the identity, and remember it as the value to write back
- write a new identity, up to 16 ASCII characters, space-padded exactly as the firmware pads it
- write the remembered identity back
- print the frame that went out, so it can be checked against the firmware

## The frame

`cmd 0x1F`, a byte-for-byte port of `CommandBuilder.setDeviceName` in the Laufbursche Edition app:

```
AA 1F <16 ASCII name bytes, space-padded> FF <CRC-8>
```

CRC-8 with polynomial 0x07 over the first 19 bytes. Byte 18 stays `0xFF`, because the handler reads only the 16 name bytes. The controller copies them into the identity in RAM, persists them to its EEPROM and hands them to the Bluetooth module.

The port is verified against the app: the four methods were compiled out of `CommandBuilder.java` and produce the same bytes for the same input.

## What the identity does

The first three characters gate the eKFV speed clamp in the stock firmware: an identity starting with `TDE` is the limited one. On a Laufbursche firmware the clamp hangs off the live Bluetooth lock instead, so renaming does not unlock anything there.

The value survives a restart because it lives in the controller's EEPROM. Write the original down before you change it.

## Before you use it

Use at your own risk. See the warnings the page itself shows.

## Browser

Chrome on Android or desktop, and Bluefy on iOS. Safari has no Web Bluetooth at all, so a home-screen bookmark made in Safari cannot work.
