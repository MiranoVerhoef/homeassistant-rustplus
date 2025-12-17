# HomeAssistant Rust+ — Rust+ MQTT Bridge (Add-on)

## v0.2.1
- Fixes startup crash caused by an invalid leading character in `index.js`
- Ingress web UI ("Pairing Wizard") to paste/upload Rust+ credentials JSON
- Saves persistent state to `/data/state.json`

## What it does today
- Provides the pairing wizard UI in Home Assistant
- Stores credentials + device lists

## Next
- Connect to Rust+ using the saved credentials
- Publish MQTT Discovery entities
- Poll state + accept switch commands
