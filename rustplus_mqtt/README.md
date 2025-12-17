# HomeAssistant Rust+ — Rust+ MQTT Bridge (Add-on)

This repository provides a Home Assistant add-on that bridges Rust+ to Home Assistant using MQTT Discovery.

## v0.2.0
- Adds Home Assistant Ingress Web UI ("Pairing Wizard")
- Wizard lets you paste or upload Rust+ credentials JSON
- Stores persistent state in `/data/state.json`

## Pairing
Home Assistant cannot run an interactive Steam login like the Rust+ mobile app.
Instead, use the standard Rust+ bot pairing flow on a PC:

- `npx @liamcottle/rustplus.js fcm-register`
- `npx @liamcottle/rustplus.js fcm-listen`
- Pair in-game (Escape → Pairing)

Paste the resulting JSON into the add-on UI.

## Next
- Implement Rust+ connection and publish MQTT Discovery entities
- Poll entity state + handle switch commands
