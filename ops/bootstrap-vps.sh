#!/bin/sh
set -eu

APP_DIR=/opt/cr-recursos/app
BACKUP_DIR=/opt/cr-recursos/backups
SOURCE_DB_CONTAINER=postgres
DEST_DB_CONTAINER=cr-recursos-postgres

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

if [ ! -f .env ]; then
  CR_DB_PASSWORD=$(openssl rand -hex 32)
  CR_JWT_SECRET=$(openssl rand -hex 64)
  umask 077
  {
    echo 'POSTGRES_DB=cr_recursos'
    echo 'POSTGRES_USER=cr_recursos'
    echo "POSTGRES_PASSWORD=$CR_DB_PASSWORD"
    echo "JWT_SECRET=$CR_JWT_SECRET"
    echo 'FRONTEND_URL=https://hub.crrecursos.com.br,https://cr-recursos-sistema.vercel.app'
    echo 'BASE_URL=https://api-hub.crrecursos.com.br'
    echo 'SMTP_HOST='
    echo 'SMTP_PORT=587'
    echo 'SMTP_SECURE=false'
    echo 'SMTP_USER='
    echo 'SMTP_PASS='
    echo 'SMTP_FROM=CR Recursos <no-reply@cr-recursos.local>'
  } > .env
  echo '[bootstrap] segredos de produção gerados'
fi

docker compose up -d postgres
docker volume create cr-recursos-uploads >/dev/null

CR_TRIES=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$DEST_DB_CONTAINER" 2>/dev/null || true)" = healthy ]; do
  CR_TRIES=$((CR_TRIES + 1))
  if [ "$CR_TRIES" -gt 30 ]; then
    echo '[bootstrap] PostgreSQL não ficou saudável' >&2
    exit 1
  fi
  sleep 2
done

if [ ! -f "$BACKUP_DIR/.data-cloned" ]; then
  CR_STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  CR_SOURCE_BACKUP="$BACKUP_DIR/source-before-clone-$CR_STAMP.sql"
  CR_PRE_MIGRATION_BACKUP="$BACKUP_DIR/cr-pre-migration-$CR_STAMP.dump"

  echo '[bootstrap] criando snapshot consistente da base original'
  docker exec "$SOURCE_DB_CONTAINER" pg_dump -U despachante -d despachante --no-owner --no-acl > "$CR_SOURCE_BACKUP"

  echo '[bootstrap] restaurando a cópia no PostgreSQL próprio da CR Recursos'
  docker exec -i "$DEST_DB_CONTAINER" psql -U cr_recursos -d cr_recursos -v ON_ERROR_STOP=1 < "$CR_SOURCE_BACKUP"

  echo '[bootstrap] isolando apenas CR Recursos e o administrador global'
  docker exec -i "$DEST_DB_CONTAINER" psql -U cr_recursos -d cr_recursos -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE TEMP TABLE keep_tenants AS
SELECT id FROM tenants WHERE slug = 'cr-recursos'
UNION
SELECT tenant_id FROM users WHERE role = 'super_admin';

SET LOCAL session_replication_role = replica;
DO $$
DECLARE item RECORD;
BEGIN
  FOR item IN
    SELECT table_name
      FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'tenant_id'
  LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE tenant_id NOT IN (SELECT id FROM keep_tenants)',
      item.table_name
    );
  END LOOP;
END $$;
DELETE FROM tenants WHERE id NOT IN (SELECT id FROM keep_tenants);
UPDATE tenants
   SET name = 'CR Recursos Sistema', slug = 'cr-recursos-system'
 WHERE id IN (SELECT tenant_id FROM users WHERE role = 'super_admin');
UPDATE users SET name = 'Administrador do Sistema' WHERE role = 'super_admin';
SET LOCAL session_replication_role = origin;
COMMIT;
ANALYZE;
SQL

  CR_TENANT_ID=$(docker exec "$DEST_DB_CONTAINER" psql -U cr_recursos -d cr_recursos -Atc "SELECT id FROM tenants WHERE slug='cr-recursos' LIMIT 1")
  if [ -n "$CR_TENANT_ID" ]; then
    docker run --rm \
      -v chronostek-backend-uploads:/source:ro \
      -v cr-recursos-uploads:/destination \
      alpine:3.22 sh -c "if [ -d /source/$CR_TENANT_ID ]; then cp -a /source/$CR_TENANT_ID /destination/; fi"
  fi

  docker exec "$DEST_DB_CONTAINER" pg_dump -U cr_recursos -d cr_recursos -Fc --no-owner --no-acl > "$CR_PRE_MIGRATION_BACKUP"
  touch "$BACKUP_DIR/.data-cloned"
fi

echo '[bootstrap] construindo e iniciando backend'
docker compose up -d --build backend

CR_TRIES=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' cr-recursos-backend 2>/dev/null || true)" = healthy ]; do
  CR_TRIES=$((CR_TRIES + 1))
  if [ "$CR_TRIES" -gt 45 ]; then
    docker logs --tail 120 cr-recursos-backend >&2
    echo '[bootstrap] backend não ficou saudável' >&2
    exit 1
  fi
  sleep 2
done

echo '[bootstrap] backend e banco próprios estão saudáveis'
