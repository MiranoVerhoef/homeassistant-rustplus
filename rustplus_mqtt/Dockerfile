FROM node:20-alpine

WORKDIR /app

# --- Experimental embedded desktop stack (used via separate port 16080 -> container 6080) ---
RUN apk add --no-cache         chromium         xvfb         fluxbox         x11vnc         novnc         websockify         bash         tini         font-noto         ttf-dejavu         ca-certificates         curl

# Some scripts expect google-chrome
RUN ln -sf /usr/bin/chromium-browser /usr/bin/google-chrome || true

COPY package.json .
RUN npm install --omit=dev

COPY . .
RUN chmod +x run.sh

ENTRYPOINT ["/sbin/tini","--"]
CMD ["./run.sh"]
