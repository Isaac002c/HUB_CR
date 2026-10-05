#!/bin/sh
set -eu

APP_DIR=/opt/cr-recursos/app
LEGACY_PROXY_DIR=/opt/chronostek/apps/despachante/saas-multitenant
VHOST_DIR="$LEGACY_PROXY_DIR/nginx/vhosts.d"
VHOST_FILE="$VHOST_DIR/cr-recursos.conf"
OVERRIDE_FILE="$LEGACY_PROXY_DIR/docker-compose.override.yml"
DOMAIN=api-hub.crrecursos.com.br
LEGACY_DOMAIN=api-cr-recursos.167-233-26-140.sslip.io

mkdir -p "$VHOST_DIR"
cp "$APP_DIR/nginx/api-init.conf" "$VHOST_FILE"
docker cp "$VHOST_FILE" despachante-nginx:/etc/nginx/conf.d/cr-recursos.conf
docker exec despachante-nginx nginx -t
docker exec despachante-nginx nginx -s reload

if [ ! -f "/var/lib/docker/volumes/chronostek-certbot-certs/_data/live/$DOMAIN/fullchain.pem" ]; then
  docker run --rm \
    -v chronostek-certbot-certs:/etc/letsencrypt \
    -v chronostek-certbot-webroot:/var/www/certbot \
    certbot/certbot:latest certonly --webroot --webroot-path /var/www/certbot \
    --email admin@chronostek.com.br --agree-tos --no-eff-email -d "$DOMAIN"
fi

# O vhost definitivo mantém o endereço técnico antigo apenas como redirecionamento.
if [ ! -f "/var/lib/docker/volumes/chronostek-certbot-certs/_data/live/$LEGACY_DOMAIN/fullchain.pem" ]; then
  docker run --rm \
    -v chronostek-certbot-certs:/etc/letsencrypt \
    -v chronostek-certbot-webroot:/var/www/certbot \
    certbot/certbot:latest certonly --webroot --webroot-path /var/www/certbot \
    --email admin@chronostek.com.br --agree-tos --no-eff-email -d "$LEGACY_DOMAIN"
fi

cp "$APP_DIR/nginx/api.conf" "$VHOST_FILE"
docker cp "$VHOST_FILE" despachante-nginx:/etc/nginx/conf.d/cr-recursos.conf
docker exec despachante-nginx nginx -t
docker exec despachante-nginx nginx -s reload

if [ ! -f "$OVERRIDE_FILE" ]; then
  cat > "$OVERRIDE_FILE" <<'YAML'
services:
  nginx:
    volumes:
      - ./nginx/vhosts.d/cr-recursos.conf:/etc/nginx/conf.d/cr-recursos.conf:ro
YAML
fi

cat > /etc/cron.d/cr-recursos-certbot <<'CRON'
17 3 * * * root docker run --rm -v chronostek-certbot-certs:/etc/letsencrypt -v chronostek-certbot-webroot:/var/www/certbot certbot/certbot:latest renew --webroot --webroot-path /var/www/certbot --quiet && docker exec despachante-nginx nginx -s reload
CRON
chmod 0644 /etc/cron.d/cr-recursos-certbot

echo '[nginx] endpoint HTTPS próprio instalado'
