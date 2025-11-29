# ────────────────────────────────────────────────
# 🧠 AI Podcast Suite — Shiper Ultra-Stable Build
# Now with ffmpeg installed properly
# ────────────────────────────────────────────────

FROM node:22-slim AS base
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

# 🔥 Install ffmpeg HERE (BUILD STAGE)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# 1️⃣ Install dependencies
COPY package*.json* ./
RUN npm install --omit=dev && npm cache clean --force

# 2️⃣ Copy everything (whether flat or nested)
COPY . .

# 3️⃣ Flatten nested repo if detected
RUN if [ ! -f server.js ] && [ -f AI-management-suite-main/server.js ]; then \
      echo '🧩 Detected nested repo structure, flattening…' && \
      cp -r AI-management-suite-main/* . && \
      rm -rf AI-management-suite-main; \
    fi

# 4️⃣ Validate entry files
RUN node --check server.js || (echo '❌ server.js missing or invalid' && ls -R /app && exit 1)

# ────────────────────────────────────────────────
# Runtime Stage
# ────────────────────────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

# 🔥 Install ffmpeg HERE TOO (RUNTIME STAGE)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

COPY --from=base /app /app

# ✅ Auto-detect and start from the correct location
ENTRYPOINT ["/bin/sh", "-c", "if [ -f server.js ]; then node scripts/bootstrap.js && node server.js; elif [ -f AI-management-suite-main/server.js ]; then node AI-management-suite-main/scripts/bootstrap.js && node AI-management-suite-main/server.js; else echo '❌ server.js not found' && ls -R /app && exit 1; fi"]

EXPOSE 3000
CMD []
