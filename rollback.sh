#!/usr/bin/env bash
# Rollback a deploy.sh run: re-tag backup images as :deploy and restart.
# Usage: ./rollback.sh 20261008-093000
set -euo pipefail

APP_DIR="/opt/laras-git"
COMPOSE="docker compose"

if [ $# -ne 1 ]; then
	echo "usage: $0 <backup-tag-suffix from deploy output>" >&2
	exit 1
fi
STAMP="$1"

cd "$APP_DIR"
docker tag "laras-horizon-web:backup-$STAMP" laras-horizon-web:deploy
docker tag "laras-horizon-pocketbase:backup-$STAMP" laras-horizon-pocketbase:deploy
$COMPOSE up -d
$COMPOSE ps
echo "rolled back to backup-$STAMP"
