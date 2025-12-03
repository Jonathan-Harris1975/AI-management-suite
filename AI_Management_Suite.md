# AI Management Suite

> A modular suite of AI‑services built with Node 22 + ESM, designed for flexible deployment (e.g., via Docker).  
> Maintained by Jonathan Harris.

## 📦 Table of Contents
- [About](#about)  
- [Features](#features)  
- [Architecture](#architecture)  
- [Service Directory Breakdown](#service-directory-breakdown)
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

## Service Directory Breakdown

The `services/` directory contains the core microservices that handle specific parts of the AI workflow. Each service is designed to be independent and focused on a single responsibility.

| Folder | Function |
| :--- | :--- |
| `api` | **API Gateway and Router:** Serves as the central entry point for all external requests, routing them to the appropriate microservices (e.g., `podcast`, `script`, `tts`, `artwork`). |
| `podcast` | **Podcast Orchestration Pipeline:** Manages the end-to-end process of creating a podcast episode, from initiation to final assembly, by coordinating the `script`, `tts`, and `artwork` services. |
| `artwork` | **Visual Asset Management:** Dedicated to generating, processing, and managing visual assets, such as cover art or social media images, for podcast episodes. |
| `rss-feed-creator` | **Content Filtering Utility:** Contains logic for filtering external content (e.g., from RSS feeds) to determine its relevance, specifically using an `isAIRelevant` check. |
| `rss-feed-podcast` | **Podcast RSS Feed Generator:** Responsible for building the final, compliant RSS feed XML for the podcast, reading episode metadata from storage, and notifying podcast directories like PodcastIndex. |
| `script` | **Episode Script Generation:** Orchestrates the process of generating the textual content (script) for a podcast episode, likely utilizing various AI models and data sources. |
| `tts` | **Text-to-Speech (TTS) Processing:** Manages the conversion of episode scripts into audio, including the orchestration of the TTS engine, audio merging, and post-processing. |
| `shared` | **Cross-Service Utilities:** A collection of common modules, such as HTTP clients, R2 storage clients, AI configuration, and utility functions, used by multiple services to ensure consistency and reduce redundancy. |

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
