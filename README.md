# MotoVoice — Server Backend

Simple self-hosted group voice chat server over IP.

Get the mobile app for Android/iOS [here](https://github.com/motovoice/app).

## Prerequisites

- Docker + Docker Compose
    - Your user should be a member of the docker group to execute commands without sudo
- Openssl
- Domain with A-records pointing to your server:
  - `api.your-domain.com`
  - `livekit.your-domain.com`
- Valid certificate for your reverse proxy containing both domains, e. g. Lets Encrypt

## Demo Server
There is a demo server `compute1.motovoice.app` available located in Frankfurt which you can use, but I recommend setting up your own server for better availability.

## Quick Start

### Install script
A new motovoice folder will be located in your home directory after install

#### 1. Get the script
`wget https://github.com/motovoice/server/blob/main/install_server.sh`

#### 2. Start the script
`chmod +x install_server.sh && ./install_server.sh`

### Manual installation

#### 1. Get docker-compose file
`wget https://github.com/motovoice/server/blob/main/docker/docker-compose.yml`

#### 2. Create .env
Create a .env file ([Example](https://github.com/motovoice/server/blob/main/docker/.env.example))

#### 3. Generate secure secrets
```bash
openssl rand -hex 32   # → POSTGRES_PASSWORD
openssl rand -hex 64   # → JWT_SECRET
openssl rand -hex 32   # → LIVEKIT_API_SECRET
```

#### 2. Edit .env
- Insert the generated secrets in the .env file
- Edit the LIVEKIT_URL

#### 4. Create a livekit config ([Example](https://github.com/motovoice/server/blob/main/livekit/config.example.yaml))
- `mkdir livekit`
- `nano livekit/config.yaml`

#### 6. Start containers
`docker compose up -d`

## Setup your reverse proxy
- You can use the nginx/nginx.example.conf as template
- But you can also use any other reverse proxy with SSL
- Consider rate limiting in your reverse proxy
- Forward Port 443 of your public backend domain to your backend container port 3000
- Forward Port 443 of your public livekit domain to your livekit container port 7880

## Firewall rules
- Allow port 443/TCP for the reverse proxy
- Allow port 7881/TCP for livekit
- Allow port 7882/UDP for livekit

## API Docs

Swagger API Docs available under /docs after starting the backend.

## Optional password protection

Set `SERVER_PASSWORD` in your `.env` to require all `/api/*` requests to
include a matching `X-Server-Password` header. Leave it empty/unset to keep
the server open

## Stats API (for Grafana etc.)

Set `STATS_TOKEN` in your `.env` to enable a set of read-only, private
endpoints for dashboards

## Architecture

```
Internet
    │
    ├── [ Livekit :7881/TCP, :7882/UDP ]
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

