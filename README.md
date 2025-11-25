# AI Management Suite

> A modular suite of AI‑services built with Node 22 + ESM, designed for flexible deployment (e.g., via Docker).  
> Maintained by Jonathan Harris.

## 📦 Table of Contents
- [About](#about)  
- [Features](#features)  
- [Architecture](#architecture)  
- [Getting Started](#getting‑started)  
- [Usage](#usage)  
- [Configuration](#configuration)  
- [Docker Deployment](#docker‑deployment)  
- [Development](#development)  
- [Contributing](#contributing)  
- [License](#license)  
- [Contact](#contact)

## About  
The **AI Management Suite** is a collection of services intended to manage AI‑workflows in a scalable manner. Built using Node.js (v22) with ECMAScript Modules (ESM), it supports dynamic imports, has built‑in health checks (`/health` endpoint), and is optimized for containerised deployment via Docker.

## Features  
- Supports **Node 22 + ESM** for modern JS syntax and module usage.  
- Dynamic import capability: modules can be added/removed without breaking the system.  
- `/health` endpoint for monitoring service readiness and uptime.  
- Emoji‑based logging for enhanced readability in console or logs.  
- Modular folder structure:  
  - `services/` — individual AI service modules  
  - `scripts/` — automation / helper scripts  
  - `routes/` — HTTP routing layer  
  - `utils/` — shared utilities  
- Dockerfile provided for containerised deployment.  
- Environment template (`.env.template`) included for configuration.

## Architecture  
```
.
├── dockerignore
├── Dockerfile
├── env.template
├── package.json
├── server.js
├── services/
├── routes/
├── scripts/
└── utils/
```

## Getting Started  
### Prerequisites  
- Node.js v22 or newer  
- Docker  
- pnpm (optional)

### Installation  
```bash
git clone https://github.com/Jonathan‑Harris1975/AI‑management‑suite.git
cd AI‑management‑suite
pnpm install
cp env.template .env
```

## Usage  
```bash
pnpm start
```

## Docker Deployment  
```bash
docker build -t ai‑management‑suite .
docker run -d -p 3000:3000 --env-file .env ai‑management‑suite
```

## Development  
Add new services in `services/` and routes in `routes/`.

## License  
MIT

## Contact  
Maintainer: Jonathan Harris
GitHub: https://github.com/Jonathan-Harris1975
