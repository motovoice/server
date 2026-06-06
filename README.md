# MotoVoice — Server Backend

Simple self-hosted group voice chat server over IP

## Prerequisites

- Docker + Docker Compose installed
- Domain with A-records pointing to your server:
  - `api.your-domain.com`
  - `livekit.your-domain.com`

## Quick Start

### 1. Clone repo
Download the docker-compose file: `wget https://github.com/motovoice/server/blob/main/docker-compose.yml`

### 2. Create .env
Create a .env file ([Example](https://github.com/motovoice/server/blob/main/.env.example))

### 3. Generate secure secrets
```bash
openssl rand -hex 32   # → POSTGRES_PASSWORD
openssl rand -hex 64   # → JWT_SECRET
openssl rand -hex 32   # → LIVEKIT_API_SECRET
```

### 2. Edit .env
- Insert the generated secrets in the .env file
- Edit the LIVEKIT_URL

### 4. Create a livekit config ([Example](https://github.com/motovoice/server/blob/main/livekit/config.example.yaml))
- `mkdir livekit`
- `nano livekit/config.yaml`

### 6. Start containers
`docker compose up -d`

### 7. Setup your reverse proxy
- You can use the nginx/nginx.example.conf as template
- But you can also use any other reverse proxy
- Consider rate limiting in your reverse proxy
- Forward Port 443 of your public backend domain to your backend container port 3000
- Forward Port 443 of your public livekit domain to your livekit container port 7880

### 8. Firewall rules
- Allow port 443/TCP for the reverse proxy
- Allow port 7881/TCP for the livekit container
- Allow port 50000-60000/UDP for the livekit container

## API Docs

Swagger API Docs available under /docs after starting the backend.


## Architecture

```
Internet
    │
    ├── [ Livekit :7881/TCP, :50000-60000/UDP ]
    ▼
[ Reverse Proxy :443 ]
    │
    ├── /*  ──────► [ Backend :3000 ]
    │                      │
    │                 [ Postgres ]
    │
    └── WebSocket ─► [ LiveKit :7880 ]             
```

## This project uses AI-assisted development tools

### Tools
- Claude Code (Anthropic) · claude-sonnet-4-6

### Oversight
Human and AI co-author decisions; human reviews all output.

