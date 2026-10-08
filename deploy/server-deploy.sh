#!/usr/bin/env bash
# Builds and (re)starts the whole stack on this server — no Docker Hub or CI needed.
# Run from anywhere inside the project folder on the server:
#   bash deploy/server-deploy.sh
# Needs .env.production next to docker-compose.prod.yml (template: .env.production.example).
set -eo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo "Missing .env.production — copy .env.production.example and fill it in." >&2
  exit 1
fi
set -a
source .env.production
set +a
export DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-local}"
export IMAGE_TAG="${IMAGE_TAG:-latest}"

dc() {
  docker compose -f docker-compose.prod.yml -f docker-compose.build.yml --env-file .env.production "$@"
}

echo "Building images..."
dc build

case ",${COMPOSE_PROFILES:-}," in
  *,local-db,*)
    echo "Starting the database..."
    dc up -d --wait db ;;
esac

echo "Running database migrations..."
dc run --rm --no-deps backend npm run migrate

echo "Starting services..."
if ! dc up -d --wait --remove-orphans; then
  dc ps || true
  dc logs --tail=80 backend ai-service frontend caddy || true
  exit 1
fi
dc ps

curl --fail --silent --show-error http://127.0.0.1:5000/api/health
echo
echo "Deployed: https://${SITE_ADDRESS:-<set SITE_ADDRESS>}"

# Keep the disk from filling up with old image layers
docker image prune -f >/dev/null
