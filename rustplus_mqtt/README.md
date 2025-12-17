# HomeAssistant Rust+ — Rust+ MQTT Bridge (Add-on)

## v0.2.2
- Ingress sidebar pairing wizard
- Separate noVNC desktop exposed on host port **16080** (container port 6080)
- "Test connect" button publishes a Rust+ Server device via MQTT Discovery

## How it works (today)
1. Open the add-on panel (Ingress sidebar)
2. Click **Open Steam Login Desktop (port 16080)**
3. Use the desktop to perform the Steam login / pairing workflow (experimental)
4. Paste/upload the resulting JSON credentials
5. Click **Test connect & publish** to create the device in Home Assistant (via MQTT Discovery)

## Next
- Robust Rust+ connection loop
- Auto entity discovery + switches/alarms/cameras publishing
