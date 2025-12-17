const fs = require("fs");
const express = require("express");
const multer = require("multer");
const mqtt = require("mqtt");
const RustPlus = require("@liamcottle/rustplus.js");

// ---- Options & State ----
function loadOptions() {
  try {
    return JSON.parse(fs.readFileSync("/data/options.json", "utf8"));
  } catch (e) {
    console.error("Failed to read /data/options.json.", e);
    return {
      mqtt: { host: "core-mosquitto", port: 1883, discovery_prefix: "homeassistant", base_topic: "rustplus" },
      poll_seconds: 5
    };
  }
}

const STATE_PATH = "/data/state.json";
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {
      rust: { server: "", port: 0, steam_id: "", player_token: "" },
      devices: { switches: [], alarms: [], cameras: [] },
      last_connect: { ok: false, message: "Not tested yet" }
    };
  }
}
function saveState(s) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2), "utf8");
}

function normalizeImported(obj) {
  const server = obj.server || obj.ip || obj.host || (obj.serverDetails && obj.serverDetails.ip) || "";
  const port = Number(obj.port || obj.appPort || (obj.serverDetails && obj.serverDetails.port) || 0);
  const steam_id = String(obj.steamId || obj.steam_id || obj.playerId || obj.steamID || "");
  const player_token = String(obj.playerToken || obj.player_token || obj.token || "");
  return { server, port, steam_id, player_token };
}

const options = loadOptions();
let state = loadState();

// ---- MQTT ----
const mqttUrl = `mqtt://${options.mqtt.host}:${options.mqtt.port}`;
const mqttClient = mqtt.connect(mqttUrl, {
  username: options.mqtt.username || undefined,
  password: options.mqtt.password || undefined
});
mqttClient.on("connect", () => console.log("MQTT connected:", mqttUrl));
mqttClient.on("error", (err) => console.error("MQTT error:", err.message));

function publishDiscoveryServerDevice(serverLabel) {
  // Create a device + a binary_sensor "connected" so it shows up as a new device in HA via MQTT discovery.
  const discoveryPrefix = options.mqtt.discovery_prefix || "homeassistant";
  const baseTopic = options.mqtt.base_topic || "rustplus";

  const uniq = `rustplus_${serverLabel.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const device = {
    identifiers: [uniq],
    name: `Rust+ Server (${serverLabel})`,
    manufacturer: "Facepunch",
    model: "Rust+",
  };

  const connectedConfigTopic = `${discoveryPrefix}/binary_sensor/${uniq}_connected/config`;
  const connectedStateTopic = `${baseTopic}/${uniq}/connected`;

  const payload = {
    name: "Connected",
    unique_id: `${uniq}_connected`,
    state_topic: connectedStateTopic,
    payload_on: "ON",
    payload_off: "OFF",
    device_class: "connectivity",
    device,
    availability_topic: `${baseTopic}/${uniq}/availability`,
    payload_available: "online",
    payload_not_available: "offline"
  };

  mqttClient.publish(connectedConfigTopic, JSON.stringify(payload), { retain: true });

  // Mark availability + connected
  mqttClient.publish(`${baseTopic}/${uniq}/availability`, "online", { retain: true });
  mqttClient.publish(connectedStateTopic, "ON", { retain: true });
}

// ---- Rust+ test connect (minimal) ----
async function testRustConnect() {
  const { server, port, steam_id, player_token } = state.rust;
  if (!server || !port || !steam_id || !player_token) {
    throw new Error("Missing credentials (server/port/steam_id/player_token).");
  }

  // rustplus.js expects steamId as string/number; token string.
  const rp = new RustPlus({
    server,
    port,
    steamId: steam_id,
    playerToken: player_token
  });

  return new Promise((resolve, reject) => {
    let done = false;

    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      try { rp.disconnect && rp.disconnect(); } catch {}
      reject(new Error("Timeout connecting to Rust+ (15s). Check app.port/firewall/credentials."));
    }, 15000);

    // rustplus.js emits "connected" in many examples; but to avoid tight coupling, we attempt a simple request after connect.
    try {
      rp.connect();
    } catch (e) {
      clearTimeout(timeout);
      reject(e);
      return;
    }

    // Try a small delay then call getTime as a connectivity probe (common in Rust+ libs).
    setTimeout(async () => {
      if (done) return;
      try {
        if (typeof rp.getTime === "function") {
          await rp.getTime();
        }
        clearTimeout(timeout);
        done = true;
        try { rp.disconnect && rp.disconnect(); } catch {}
        resolve();
      } catch (e) {
        clearTimeout(timeout);
        done = true;
        try { rp.disconnect && rp.disconnect(); } catch {}
        reject(e);
      }
    }, 2000);
  });
}

// ---- Web UI (Ingress) ----
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });

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
    input, textarea, button, a.btn { width:100%; padding:10px 12px; border-radius: 12px; border:1px solid #d1d5db; font-size: 14px; box-sizing:border-box; }
    textarea { min-height: 120px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    button { cursor:pointer; border:none; background:#111827; color:#fff; font-weight:600; margin-top:12px; }
    a.btn { display:block; text-align:center; text-decoration:none; background:#2563eb; color:#fff; font-weight:700; border:none; margin-top:12px; }
    button.secondary { background:#374151; }
    .muted { color:#6b7280; font-size: 13px; }
    .ok { color:#065f46; }
    .bad { color:#991b1b; }
    .pill { display:inline-block; padding:4px 10px; border-radius: 999px; background:#f3f4f6; font-size: 12px; margin-left: 8px; }
    code { background:#f3f4f6; padding:2px 6px; border-radius: 8px; }
    .row { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    ${html}
  </div>

  <script>
    // Build noVNC URL using current hostname but fixed port 16080 (requested).
    const host = window.location.hostname;
    const vncUrl = "http://" + host + ":16080/vnc.html";
    const btn = document.getElementById("openVncBtn");
    if (btn) btn.href = vncUrl;
    const span = document.getElementById("vncUrl");
    if (span) span.textContent = vncUrl;
  </script>
</body>
</html>`;
}

app.get("/", (_req, res) => {
  state = loadState();
  const hasCreds = !!(state.rust.server && state.rust.port && state.rust.steam_id && state.rust.player_token);
  res.send(page(`
    <div class="card">
      <h1>Rust+ Pairing Wizard <span class="pill">v0.2.2</span></h1>
      <p class="muted">Sidebar wizard + separate Steam login desktop (noVNC) on port <b>16080</b>.</p>
      <p>Status: ${hasCreds ? '<span class="ok"><b>Credentials saved</b></span>' : '<span class="bad"><b>Not paired</b></span>'}</p>
      <p class="muted">Last connect test: <b>${state.last_connect.ok ? "OK" : "FAIL"}</b> — ${state.last_connect.message}</p>
    </div>

    <div class="card">
      <h2>Pairing</h2>
      <p class="muted">Open the embedded desktop to perform Steam login (experimental), then paste/upload the resulting JSON here.</p>
      <a id="openVncBtn" class="btn" target="_blank" rel="noreferrer">Open Steam Login Desktop (port 16080)</a>
      <p class="muted">URL: <code id="vncUrl">(loading...)</code></p>
    </div>

    <div class="card">
      <h2>Import credentials</h2>
      <form method="post" action="/api/import_json">
        <label>Paste credentials JSON</label>
        <textarea name="json" placeholder='{"server":"1.2.3.4","port":28082,"steamId":"7656...","playerToken":"..."}'></textarea>
        <button type="submit">Save credentials</button>
      </form>

      <form method="post" action="/api/upload" enctype="multipart/form-data" style="margin-top: 14px;">
        <label>Or upload a JSON file</label>
        <input type="file" name="file" accept=".json,application/json" />
        <button class="secondary" type="submit">Upload &amp; Save</button>
      </form>

      <form method="post" action="/api/test_connect">
        <button type="submit">Test connect &amp; publish “new device” to Home Assistant</button>
      </form>
    </div>

    <div class="card">
      <h2>Devices (manual for now)</h2>
      <p class="muted">Auto entity discovery comes next. You can store lists here now.</p>
      <form method="post" action="/api/save_devices">
        <label>Switches (JSON array)</label>
        <textarea name="switches">${JSON.stringify(state.devices.switches, null, 2)}</textarea>

        <label>Alarms (JSON array)</label>
        <textarea name="alarms">${JSON.stringify(state.devices.alarms, null, 2)}</textarea>

        <label>Cameras (JSON array)</label>
        <textarea name="cameras">${JSON.stringify(state.devices.cameras, null, 2)}</textarea>

        <button type="submit">Save devices</button>
      </form>
    </div>
  `));
});

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

app.post("/api/test_connect", async (_req, res) => {
  try {
    await testRustConnect();
    state = loadState();
    state.last_connect = { ok: true, message: "Connected successfully. MQTT Discovery published." };
    saveState(state);

    const label = `${state.rust.server}:${state.rust.port}`;
    publishDiscoveryServerDevice(label);

    res.redirect("/");
  } catch (e) {
    state = loadState();
    state.last_connect = { ok: false, message: String(e && e.message ? e.message : e) };
    saveState(state);

    res.redirect("/");
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, version: "0.2.2" }));

app.listen(8099, () => console.log("Ingress UI listening on port 8099"));
