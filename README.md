# MotoVoice — Server Backend

Simple self-hosted group voice chat server over IP

## Prerequisites

- Docker + Docker Compose installed
- Domain with A-records pointing to the server IP:
  - `api.your-domain.com`
  - `livekit.your-domain.com`
- Open firewall ports: `443`, `7881` (TCP), `50000–60000` (UDP)

## Quick Start

```bash
# 1. Clone repo
git clone https://github.com/motovoice/server

# 3. Generate secure secrets
openssl rand -hex 32   # → POSTGRES_PASSWORD
openssl rand -hex 64   # → JWT_SECRET
openssl rand -hex 32   # → LIVEKIT_API_SECRET

# 2. Create and fill in .env
cp .env.example .env
nano .env

# 3. Generate secure secrets
openssl rand -hex 32   # → POSTGRES_PASSWORD
openssl rand -hex 64   # → JWT_SECRET
openssl rand -hex 32   # → LIVEKIT_API_SECRET

# 4. Copy livekit config and optionally modify it
cp livekit/config.example.yaml livekit/config.yaml

# 5. Build container
docker compose build --no-cache

# 6. Start containers
docker compose up -d

# 7. Setup your reverse proxy
# You can use the nginx/nginx.example.conf as template
```

## API Docs

Swagger API Docs available under /docs


## Architecture

```
Internet
    │
    ├── [ Livekit :7881/TCP, :50000-60000/UDP ]
    ▼
[ Nginx :443 ]
    │
    ├── /api/*  ──────► [ Backend :3000 ]
    │                         │
    │                    [ Postgres ]
    │
    └── WebSocket ─► [ LiveKit :7880 ]             
```

## This project uses AI-assisted development tools

### Tools
- Claude Code (Anthropic) · claude-sonnet-4-6

### Oversight
Human and AI co-author decisions; human reviews all output.

