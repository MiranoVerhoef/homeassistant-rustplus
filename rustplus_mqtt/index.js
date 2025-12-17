import mqtt from "mqtt";
import { RustPlus } from "@rustmeta/rustplus-ts";

// Home Assistant add-on options are mounted at /data/options.json
import fs from "node:fs";

function loadOptions() {
  try {
    return JSON.parse(fs.readFileSync("/data/options.json", "utf8"));
  } catch (e) {
    console.error("Failed to read /data/options.json. Did you configure the add-on options?", e);
    return null;
  }
}

const options = loadOptions();
if (!options) process.exit(1);

console.log("Rust+ MQTT Bridge starting (v0.1.1)...");
console.log("MQTT host:", options?.mqtt?.host, "port:", options?.mqtt?.port);
console.log("Rust server:", options?.rust?.server, "port:", options?.rust?.port);

// NOTE: This is still a scaffold. Next step is wiring:
// - MQTT discovery publishing
// - RustPlus connection + polling
// The import above ensures the npm dependency resolves during build.

// Keep process alive
setInterval(() => {}, 1000);
