#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/cr-recursos/app"
ARCHIVE="/tmp/cr-resend-deploy-20260820.tar.gz"
BACKUP_DIR="/opt/cr-recursos/backups"

test "$(readlink -f "$APP_DIR")" = "/opt/cr-recursos/app"
test -f "$APP_DIR/docker-compose.yml"
test -f "$ARCHIVE"
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
tar -czf "$BACKUP_DIR/app-pre-resend-$timestamp.tar.gz" \
  --exclude='.env' --exclude='node_modules' --exclude='backend/node_modules' \
  --exclude='.next' --exclude='.vercel' -C "$APP_DIR" .

tar -xzf "$ARCHIVE" -C "$APP_DIR"

ensure_env() {
  key="$1"
  value="$2"
  if ! grep -q "^${key}=" "$APP_DIR/.env"; then
    printf '%s=%s\n' "$key" "$value" >> "$APP_DIR/.env"
  fi
}

# Configuração segura: infraestrutura ativa, automação desligada até a conta
# Resend fornecer chave, remetente verificado e signing secret do webhook.
ensure_env EMAIL_PROVIDER resend
ensure_env EMAIL_AUTOMATION_ENABLED false
ensure_env EMAIL_DOMAIN_VERIFIED false
ensure_env EMAIL_FROM_NAME "CR Recursos"
ensure_env EMAIL_FROM_ADDRESS ""
ensure_env EMAIL_REPLY_TO ""
ensure_env EMAIL_TEST_RECIPIENT ""
ensure_env RESEND_API_KEY ""
ensure_env RESEND_WEBHOOK_SECRET ""
ensure_env APP_URL "https://hub.crrecursos.com.br"
ensure_env EMAIL_WORKER_ENABLED true
ensure_env EMAIL_WORKER_INTERVAL_MS 10000
ensure_env EMAIL_BATCH_SIZE 10
ensure_env EMAIL_MAX_ATTEMPTS 5
ensure_env EMAIL_PROCESSING_TIMEOUT_MINUTES 10

cd "$APP_DIR"
docker compose build backend
docker compose run --rm backend node scripts/migrate.js
docker compose up -d backend

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8099/health >/dev/null; then
    docker compose ps
    curl -fsS http://127.0.0.1:8099/health
    printf '\nbackup=%s\n' "$BACKUP_DIR/app-pre-resend-$timestamp.tar.gz"
    exit 0
  fi
  sleep 2
done

docker compose logs --tail=100 backend
exit 1
