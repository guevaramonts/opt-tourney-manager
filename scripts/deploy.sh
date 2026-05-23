#!/usr/bin/env bash
# Run this once on the GCP VM to install Docker, clone the repo, and start the stack.
# Usage: bash deploy.sh
set -euo pipefail

REPO_URL="https://github.com/$(git -C "$(dirname "$0")/.." remote get-url origin 2>/dev/null | sed 's|.*github.com[:/]\(.*\)\.git|\1|' || echo 'YOUR_GITHUB_USER/OPT-App')"
APP_DIR="$HOME/opt-app"
PROJECT="opt-poker-dev"
ZONE="us-central1-c"
VM="opt-poker-dev-vm"

echo "=== OPT App — VM bootstrap ==="
echo "Deploying to $VM in $PROJECT/$ZONE"

# ---- Install Docker (idempotent) ----
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "Docker installed. Re-run this script (or log out and back in) to continue."
  exit 0
fi

# ---- Install docker compose plugin (idempotent) ----
if ! docker compose version &>/dev/null; then
  echo "Installing docker compose plugin..."
  DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}"
  mkdir -p "$DOCKER_CONFIG/cli-plugins"
  curl -SL "https://github.com/docker/compose/releases/download/v2.24.6/docker-compose-linux-x86_64" \
    -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
  chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"
fi

# ---- Clone or update repo ----
if [ -d "$APP_DIR/.git" ]; then
  echo "Pulling latest..."
  git -C "$APP_DIR" pull --ff-only
else
  echo "Cloning repo..."
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# ---- Build client ----
echo "Building client..."
cd packages/client
npm ci --prefer-offline
npm run build
cd ../..

# ---- Ensure .env exists ----
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "IMPORTANT: Edit .env before starting the stack:"
  echo "  nano $APP_DIR/.env"
  echo "Set DB_PASSWORD to a strong password, then re-run this script."
  exit 0
fi

# ---- Start stack ----
echo "Starting docker compose..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "=== Done ==="
echo "Health check: curl http://localhost/api/health"
echo "Admin:        http://34.57.182.231/admin"
echo "Clock:        http://34.57.182.231/clock"
