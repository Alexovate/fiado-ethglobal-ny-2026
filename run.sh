#!/usr/bin/env bash
# Long-lived dev processes for Fiado — run this in YOUR terminal and leave it open.
# Usage:
#   ./run.sh                         # random ngrok URL
#   ./run.sh my-domain.ngrok-free.app   # bind to your reserved ngrok domain
#
# Claude edits code + rebuilds the app; the backend auto-reloads (tsx watch) and
# `vite preview` serves the freshly built dist on the next load — no restart needed.
set -m
cd "$(dirname "$0")"
DOMAIN="${1:-}"

cleanup() { echo "stopping…"; kill 0 2>/dev/null; }
trap cleanup EXIT INT TERM

echo "▶ backend (auto-reload) on :3001"
( cd backend && npx tsx watch src/index.ts ) &

echo "▶ building app + preview (production build — required for the World ID flow) on :4173"
npm --prefix app run build
( npm --prefix app run preview -- --port 4173 ) &
sleep 2

echo "▶ ngrok -> :4173"
if [ -n "$DOMAIN" ]; then
  ngrok http 4173 --url "https://$DOMAIN"
else
  ngrok http 4173
fi
