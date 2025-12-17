const fs = require("fs");
const mqtt = require("mqtt");
const RustPlus = require("@liamcottle/rustplus.js");

function loadOptions() {
  try {
    return JSON.parse(fs.readFileSync("/data/options.json", "utf8"));
  } catch (e) {
    console.error("Failed to read /data/options.json. Configure add-on options first.", e);
    return null;
  }
}

const options = loadOptions();
if (!options) process.exit(1);

console.log("Rust+ MQTT Bridge starting (v0.1.2)...");
console.log("Using @liamcottle/rustplus.js");

// Skeleton: prove deps install and options load.
console.log("MQTT:", options.mqtt?.host + ":" + options.mqtt?.port);
console.log("Rust:", options.rust?.server + ":" + options.rust?.port);

// Keep alive
setInterval(() => {}, 1000);
