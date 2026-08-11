#!/usr/bin/env bash
#
# Simple setup script for the MotoVoice server backend.
#
# Creates .env + livekit/config.yaml, generates secrets and starts the containers.
# Reverse proxy, DNS and firewall must be set up separately (see README).

set -euo pipefail

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------
INSTALL_DIR="${INSTALL_DIR:-$HOME/motovoice}"
RAW_BASE="https://raw.githubusercontent.com/motovoice/server/main"

# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
info()  { echo -e "\033[1;34m[*]\033[0m $*"; }
ok()    { echo -e "\033[1;32m[✓]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[!]\033[0m $*"; }
err()   { echo -e "\033[1;31m[✗]\033[0m $*" >&2; }

need() {
  command -v "$1" >/dev/null 2>&1 || { err "Required tool missing: $1"; exit 1; }
}

# ----------------------------------------------------------------------
# Check prerequisites
# ----------------------------------------------------------------------
info "Checking prerequisites ..."
need docker
need openssl
need curl

if ! docker compose version >/dev/null 2>&1; then
  err "'docker compose' (v2) not found. Please install the Docker Compose plugin."
  exit 1
fi
ok "Docker + Compose + openssl available."

# ----------------------------------------------------------------------
# Ask for domain
# ----------------------------------------------------------------------
read -rp "LiveKit domain (e.g. livekit.your-domain.com): " LIVEKIT_DOMAIN
LIVEKIT_DOMAIN="${LIVEKIT_DOMAIN:-livekit.your-domain.com}"

# ----------------------------------------------------------------------
# Prepare directory
# ----------------------------------------------------------------------
info "Creating install directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/livekit"
cd "$INSTALL_DIR"

# ----------------------------------------------------------------------
# Fetch docker-compose.yml
# ----------------------------------------------------------------------
info "Downloading docker-compose.yml ..."
curl -fsSL "$RAW_BASE/docker/docker-compose.yml" -o docker-compose.yml
ok "docker-compose.yml saved."

# ----------------------------------------------------------------------
# Generate secrets
# ----------------------------------------------------------------------
info "Generating secrets ..."
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
JWT_SECRET="$(openssl rand -hex 64)"
LIVEKIT_API_SECRET="$(openssl rand -hex 32)"
LIVEKIT_API_KEY="motovoice_key"
ok "Secrets generated."

# ----------------------------------------------------------------------
# Write .env (only if it does not exist)
# ----------------------------------------------------------------------
if [[ -f .env ]]; then
  warn ".env already exists – will NOT be overwritten."
else
  info "Writing .env ..."
  cat > .env <<EOF
# Log level: trace | debug | info | warn | error | fatal | silent
LOG_LEVEL=info

# PostgreSQL
POSTGRES_DB=motovoice
POSTGRES_USER=motovoice
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

JWT_SECRET=${JWT_SECRET}

SERVER_PASSWORD=
STATS_TOKEN=

# LiveKit
LIVEKIT_URL=wss://${LIVEKIT_DOMAIN}
LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
EOF
  chmod 600 .env
  ok ".env written (chmod 600)."
fi

# ----------------------------------------------------------------------
# Write LiveKit config (only if it does not exist)
# ----------------------------------------------------------------------
if [[ -f livekit/config.yaml ]]; then
  warn "livekit/config.yaml already exists – will NOT be overwritten."
else
  info "Writing livekit/config.yaml ..."
  cat > livekit/config.yaml <<EOF
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  # use_external_ip should be true for most cloud environments.
  use_external_ip: true
keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}
room:
  departure_timeout: 900
  empty_timeout: 900
  max_participants: 40
  # only allow audio
  enabled_codecs:
    - mime: audio/opus
logging:
  level: info
  pion_level: error
EOF
  ok "livekit/config.yaml written."
fi

# ----------------------------------------------------------------------
# Start containers
# ----------------------------------------------------------------------
info "Starting containers (docker compose up -d) ..."
docker compose up -d
ok "Containers started."

# ----------------------------------------------------------------------
# Done
# ----------------------------------------------------------------------
cat <<EOF

$(ok "Done!")

Directory: $INSTALL_DIR

Still to do manually (see README):
  1. DNS: point A records for api.your-domain.com and ${LIVEKIT_DOMAIN}
     to this server.
  2. Reverse proxy (443) -> backend :3000 and LiveKit WS :7880.
     Template: nginx/nginx.example.conf in the repo.
  3. Firewall:
       443/TCP          (reverse proxy)
       7881/TCP         (LiveKit)
       7882/UDP         (LiveKit)

  Health: https://api.your-domain.com/health (after proxy setup)

EOF