# agent

The live credit-agent implementation lives in `backend/src/brain.ts`.

The backend spawns the local `claude` CLI headlessly for gray-zone decisions and
falls back to deterministic policy when the CLI is unavailable. This directory is
kept only as a placeholder for future standalone agent experiments.
