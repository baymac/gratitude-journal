# Docker — Development

Runs the full stack locally: app + nginx + Ollama.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)

## Quick start

```bash
# 1. Copy and fill in env vars
cp docker/envs/.env.example docker/envs/.env

# 2. Start
docker compose -f docker/docker-compose.yml up --build

# 3. Open http://localhost
```

The first start pulls the Ollama image and may take a minute. The app waits for Ollama to be healthy before starting.

## Services

| Service | Container port | Host port |
|---------|---------------|-----------|
| app (Node.js) | 3000 | `${PORT:-3000}` |
| nginx | 80 | 80 |
| ollama | 11434 | 11434 |

## Hot reload

The app container mounts the project root, and uses `node --watch`. Edit any `.js` file and the server restarts automatically.

## Stop

```bash
docker compose -f docker/docker-compose.yml down
# To also remove the Ollama model volume:
docker compose -f docker/docker-compose.yml down -v
```
