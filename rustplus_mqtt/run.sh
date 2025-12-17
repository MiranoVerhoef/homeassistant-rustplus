#!/bin/sh
set -e

export DISPLAY=:1
export XDG_RUNTIME_DIR=/tmp/xdg
mkdir -p /tmp/xdg /data
chmod 700 /tmp/xdg || true

echo "[rustplus] Starting Xvfb..."
Xvfb :1 -screen 0 1280x720x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &

echo "[rustplus] Starting fluxbox..."
fluxbox >/tmp/fluxbox.log 2>&1 &

echo "[rustplus] Starting x11vnc on :5901..."
x11vnc -display :1 -forever -shared -rfbport 5901 -nopw >/tmp/x11vnc.log 2>&1 &

echo "[rustplus] Starting noVNC on :6080 (host port mapped to 16080)..."
websockify --web=/usr/share/novnc/ 6080 localhost:5901 >/tmp/novnc.log 2>&1 &

echo "[rustplus] Starting Ingress UI on :8099..."
node index.js
