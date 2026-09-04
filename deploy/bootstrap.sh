#!/usr/bin/env bash
# نشر/تحديث Quesna Go على الـ VPS بأمر واحد.
#   curl -fsSL https://raw.githubusercontent.com/za11ran/quesna-go-auth-api/main/deploy/bootstrap.sh | DOMAIN=api.quesnago.com bash
set -euo pipefail

REPO="${REPO:-https://github.com/za11ran/quesna-go-auth-api.git}"
DIR="${DIR:-/opt/quesna-go-auth-api}"
DOMAIN="${DOMAIN:-api.quesnago.com}"

if ! command -v git >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y git
fi

if [[ -d "$DIR/.git" ]]; then
  echo "==> تحديث الريبو الموجود"
  git -C "$DIR" pull --ff-only
else
  echo "==> استنساخ الريبو"
  git clone "$REPO" "$DIR"
fi

cd "$DIR"
DOMAIN="$DOMAIN" bash deploy/setup-server.sh
