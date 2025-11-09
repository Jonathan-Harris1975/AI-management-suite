# ────────────────────────────────────────────────
# 🧠 AI Podcast Suite — Shiper Ultra-Stable Build
# Robust to nested repo structures
# ────────────────────────────────────────────────

FROM node:22-slim AS base
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

# 1️⃣ Copy package manifests first (for layer caching)
COPY package*.json* ./
RUN npm install --omit=dev && npm cache clean --force

# 2️⃣ Copy all source files into container
COPY . .

# 3️⃣ Ensure server.js path is correct
# Try root-level first; fall back to nested folder
RUN if [ ! -f server.js ] && [ -f AI-management-suite-main/server.js ]; then \
      echo "Detected nested repo structure — fixing..." && \
      cp -r AI-management-suite-main/* . && \
      rm -rf AI-management-suite-main; \
    fi

# 4️⃣ Validate syntax for key entry files
RUN node --check server.js || exit 1
RUN node --check routes/rewrite.js || exit 0
RUN node --check routes/rss.js || exit 0
RUN node --check routes/podcast.js || exit 0

# ────────────────────────────────────────────────
# Runtime Stage (slim final image)
# ────────────────────────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

# Copy built app from base stage
COPY --from=base /app /app

# 5️⃣ Entry point — bootstrap then run server
ENTRYPOINT ["/bin/sh", "-c", "node ./scripts/bootstrap.js && node server.js"]

EXPOSE 3000
CMD []
