#!/usr/bin/env bash
# LARAS production deploy: converge /opt/laras-git to origin/main, rebuild,
# restart. Manual by design: every deploy restarts live containers.
#
# Usage:  ./deploy.sh
# Rollback: ./rollback.sh <backup-tag-suffix>   (printed by this script)
#
# Fails loudly instead of guessing: --ff-only (no merges), health gate,
# no auto-rollback (a human decides on a live academic box).
set -euo pipefail

APP_DIR="/opt/laras-git"
COMPOSE="docker compose"
WEB_IMAGE="laras-horizon-web:deploy"
PB_IMAGE="laras-horizon-pocketbase:deploy"
STAMP="$(date +%Y%m%d-%H%M%S)"

cd "$APP_DIR"

echo "=== 1/5 git pull (fast-forward only) ==="
git fetch origin
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [ "$LOCAL" = "$REMOTE" ]; then
	echo "already at $LOCAL, rebuilding anyway"
else
	git pull --ff-only origin main
	echo "updated $LOCAL -> $(git rev-parse HEAD)"
fi

if [ ! -f .env ]; then
	echo "FATAL: $APP_DIR/.env missing. Copy from /opt/laras-horizon/.env (mode 600)." >&2
	exit 1
fi

echo "=== 2/5 tag current images for rollback ==="
for img in "$WEB_IMAGE" "$PB_IMAGE"; do
	if docker image inspect "$img" >/dev/null 2>&1; then
		docker tag "$img" "${img%:*}:backup-$STAMP"
		echo "saved ${img%:*}:backup-$STAMP"
	fi
done
echo "rollback with: ./rollback.sh $STAMP"

echo "=== 3/5 build ==="
$COMPOSE build pocketbase web

echo "=== 4/5 restart ==="
$COMPOSE up -d

echo "=== 5/5 health gate (web via local port) ==="
WEB_CID="$($COMPOSE ps -q web)"
# web listens on 3000 inside its network namespace; probe from inside the container
ok=""
for _ in $(seq 1 30); do
	if docker exec "$WEB_CID" sh -c 'command -v wget >/dev/null && wget -qO- http://localhost:3000/api/health || node -e "fetch(\"http://localhost:3000/api/health\").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"' 2>/dev/null; then
		ok=1
		break
	fi
	sleep 4
done
if [ -z "$ok" ]; then
	echo "HEALTH CHECK FAILED - new containers are up but /api/health did not answer."
	echo "Inspect: $COMPOSE ps ; $COMPOSE logs --tail 50 web pocketbase"
	echo "Rollback: ./rollback.sh $STAMP"
	exit 1
fi
echo "healthy. deploy $STAMP complete."
$COMPOSE ps
