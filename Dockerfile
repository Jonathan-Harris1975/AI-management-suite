FROM node:22-slim

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Install ffmpeg
RUN apt-get update \
 && apt-get install -y ffmpeg \
 && rm -rf /var/lib/apt/lists/*

# Install deps
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy app
COPY . .

# Flatten nested repo if needed
RUN if [ ! -f server.js ] && [ -f AI-management-suite-main/server.js ]; then \
      cp -r AI-management-suite-main/* . && rm -rf AI-management-suite-main; \
    fi

# Sanity check
RUN node --check server.js

EXPOSE 3000

# 🔑 SINGLE foreground process
CMD ["node", "server.js"]
