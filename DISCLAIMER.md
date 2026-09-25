# Disclaimer

**Please read this in full before you use this page on a scooter.**

- **This is a feasibility study**, not a finished product. It exists to show what a Teverun scooter's Bluetooth protocol makes technically possible. Nothing here promises that it works with your scooter, your phone or your browser. Nothing promises it still works after the next controller firmware or browser release.
- **This is a test tool, not a tuning tool.** It does not tune, derestrict or unlock any scooter. It only writes the device identity (the FIN, i.e. the advertised BLE name) and tests whether individual assemblies are reachable behind the Bluetooth link. Changing the FIN unlocks nothing: on a Laufbursche firmware the speed clamp hangs off the live Bluetooth lock, not off the name.
- **The identity write is persistent.** The new FIN is stored in the controller's EEPROM and survives a restart. Write the original value down before you change it. The page also remembers it for you, but that copy lives only in your own browser.
- **Changing the identity can affect the road approval.** A scooter whose identity or configuration no longer matches the state it was approved in may not be a road-legal vehicle any more. The operating permit (Betriebserlaubnis) and the insurance cover can go with it. What is allowed where you live is yours to check.
- **No liability**, as far as the law allows, for any damage caused by or with this page: damage to the scooter, to people or to third parties, fines, legal consequences or any other disadvantage.
- **No warranty** of function, correctness or fitness for a particular purpose.
- Everything you do with this page is **at your own risk**.

By using this page you accept these terms.
