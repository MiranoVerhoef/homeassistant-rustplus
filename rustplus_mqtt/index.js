\
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const mqtt = require("mqtt");

// Rust+ library (connection wiring is in the next step; wizard persists creds now)
const RustPlus = require("@liamcottle/rustplus.js");

// HA add-on options (for MQTT settings)
function loadOptions() {
  try {
    return JSON.parse(fs.readFileSync("/data/options.json", "utf8"));
  } catch (e) {
    console.error("Failed to read /data/options.json.", e);
    return { mqtt: { host: "core-mosquitto", port: 1883, discovery_prefix: "homeassistant", base_topic: "rustplus" }, poll_seconds: 5 };
  }
}

// Persistent state path
const STATE_PATH = "/data/state.json";
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {
      rust: { server: "", port: 0, steam_id: "", player_token: "" },
      devices: { switches: [], alarms: [], cameras: [] }
    };
  }
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

const options = loadOptions();
let state = loadState();

console.log("Rust+ MQTT Bridge starting (v0.2.0)...");
console.log("Ingress UI enabled on :8099");
console.log("State file:", STATE_PATH);

// MQTT connect
const mqttUrl = `mqtt://${options.mqtt.host}:${options.mqtt.port}`;
const mqttClient = mqtt.connect(mqttUrl, {
  username: options.mqtt.username || undefined,
  password: options.mqtt.password || undefined
});
mqttClient.on("connect", () => console.log("MQTT connected:", mqttUrl));
mqttClient.on("error", (err) => console.error("MQTT error:", err.message));

// --- Web UI (Ingress) ---
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// A tiny, self-contained HTML UI
function page(html) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Rust+ Pairing Wizard</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 16px; }
    .wrap { max-width: 980px; margin: 0 auto; }
    .card { border: 1px solid #e5e7eb; border-radius: 16px; padding: 16px; margin: 12px 0; background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.04); }
    h1 { font-size: 22px; margin: 0 0 10px; }
    h2 { font-size: 16px; margin: 0 0 10px; }
    p, li { color: #374151; line-height: 1.4; }
    label { display:block; font-size: 13px; color:#374151; margin-top:10px; }
    input, textarea, button { width:100%; padding:10px 12px; border-radius: 12px; border:1px solid #d1d5db; font-size: 14px; }
    textarea { min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    button { cursor:pointer; border:none; background:#111827; color:#fff; font-weight:600; margin-top:12px; }
    button.secondary { background:#374151; }
    .row { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .muted { color:#6b7280; font-size: 13px; }
    .ok { color:#065f46; }
    .bad { color:#991b1b; }
    .pill { display:inline-block; padding:4px 10px; border-radius: 999px; background:#f3f4f6; font-size: 12px; margin-left: 8px; }
    code { background:#f3f4f6; padding:2px 6px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    ${html}
  </div>
</body>
</html>`;
}

app.get("/", (req, res) => {
  const hasCreds = !!(state.rust.server && state.rust.port && state.rust.steam_id && state.rust.player_token);
  res.send(page(`
    <div class="card">
      <h1>Rust+ Pairing Wizard <span class="pill">v0.2.0</span></h1>
      <p class="muted">This add-on does <b>not</b> log into Steam inside Home Assistant. Instead, you perform a one-time Rust+ pairing on another device and paste/import the generated credentials here. This still requires <b>no admin access</b>.</p>
      <p>Status: ${hasCreds ? '<span class="ok"><b>Credentials saved</b></span>' : '<span class="bad"><b>Not paired</b></span>'}</p>
    </div>

    <div class="card">
      <h2>Step 1 — Generate Rust+ credentials (one-time)</h2>
      <ol>
        <li>On a PC with Node.js, run: <code>npx @liamcottle/rustplus.js fcm-register</code> (opens a Steam login flow).</li>
        <li>Then run: <code>npx @liamcottle/rustplus.js fcm-listen</code></li>
        <li>In Rust, open <b>Escape → Pairing</b> and press <b>Pair / Resend</b>.</li>
        <li>Copy the resulting JSON (or the <code>rustplus.config.json</code> file that tool creates).</li>
      </ol>
      <p class="muted">Why: the official app relies on Steam SSO + push messaging. Home Assistant add-ons are headless, so we use the standard Rust+ bot pairing flow.</p>
    </div>

    <div class="card">
      <h2>Step 2 — Import credentials</h2>

      <form method="post" action="/api/import_json">
        <label>Paste credentials JSON</label>
        <textarea name="json" placeholder='{"server":"1.2.3.4","port":28082,"steamId":"7656...","playerToken":"..."}'></textarea>
        <button type="submit">Save credentials</button>
      </form>

      <form method="post" action="/api/upload" enctype="multipart/form-data" style="margin-top: 14px;">
        <label>Or upload a config JSON file</label>
        <input type="file" name="file" accept=".json,application/json" />
        <button class="secondary" type="submit">Upload &amp; Save</button>
      </form>
    </div>

    <div class="card">
      <h2>Step 3 — Add devices (Entity IDs)</h2>
      <p class="muted">After pairing, add your devices here. (Auto-discovery of entity IDs will be added next.)</p>

      <form method="post" action="/api/save_devices">
        <label>Switches (JSON array: [{"name":"Base Lights","entity_id":123}])</label>
        <textarea name="switches">${JSON.stringify(state.devices.switches, null, 2)}</textarea>

        <label>Alarms (JSON array)</label>
        <textarea name="alarms">${JSON.stringify(state.devices.alarms, null, 2)}</textarea>

        <label>Cameras (JSON array)</label>
        <textarea name="cameras">${JSON.stringify(state.devices.cameras, null, 2)}</textarea>

        <button type="submit">Save devices</button>
      </form>
    </div>

    <div class="card">
      <h2>What happens next</h2>
      <ul>
        <li>Next update will: connect to Rust+, publish MQTT Discovery, poll states, and allow switch control.</li>
        <li>Your saved credentials/devices persist in <code>/data/state.json</code>.</li>
      </ul>
    </div>
  `));
});

function normalizeImported(obj) {
  // accept multiple shapes from tools
  // common keys: server, port, steamId/steam_id, playerToken/player_token, appPort/app.port
  const server = obj.server || obj.ip || obj.host || (obj.serverDetails && obj.serverDetails.ip) || "";
  const port = Number(obj.port || obj.appPort || (obj.serverDetails && obj.serverDetails.port) || 0);
  const steam_id = String(obj.steamId || obj.steam_id || obj.playerId || obj.steamID || "");
  const player_token = String(obj.playerToken || obj.player_token || obj.token || "");
  return { server, port, steam_id, player_token };
}

app.post("/api/import_json", (req, res) => {
  try {
    const obj = JSON.parse(req.body.json || "{}");
    const creds = normalizeImported(obj);
    state = loadState();
    state.rust = creds;
    saveState(state);
    res.redirect("/");
  } catch (e) {
    res.status(400).send(page(`<div class="card"><h1>Invalid JSON</h1><p class="bad">${String(e.message || e)}</p><p><a href="/">Back</a></p></div>`));
  }
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) throw new Error("No file uploaded");
    const obj = JSON.parse(req.file.buffer.toString("utf8"));
    const creds = normalizeImported(obj);
    state = loadState();
    state.rust = creds;
    saveState(state);
    res.redirect("/");
  } catch (e) {
    res.status(400).send(page(`<div class="card"><h1>Upload failed</h1><p class="bad">${String(e.message || e)}</p><p><a href="/">Back</a></p></div>`));
  }
});

app.post("/api/save_devices", (req, res) => {
  try {
    const switches = JSON.parse(req.body.switches || "[]");
    const alarms = JSON.parse(req.body.alarms || "[]");
    const cameras = JSON.parse(req.body.cameras || "[]");
    state = loadState();
    state.devices = { switches, alarms, cameras };
    saveState(state);
    res.redirect("/");
  } catch (e) {
    res.status(400).send(page(`<div class="card"><h1>Invalid devices JSON</h1><p class="bad">${String(e.message || e)}</p><p><a href="/">Back</a></p></div>`));
  }
});

// health
app.get("/health", (_req, res) => res.json({ ok: true, version: "0.2.0" }));

app.listen(8099, () => console.log("Web UI listening on port 8099"));

