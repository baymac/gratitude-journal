# Open Claw Apps

A monorepo of mental health and wellbeing tracking apps powered by [Open Claw](https://openclaw.ai) — a Telegram-native AI journaling platform.

Each app exposes a small REST API that Open Claw's AI agents call during guided Telegram conversations. Apps store data in Notion and run locally or on a VPS behind nginx.

## Apps

| App | Description |
|-----|-------------|
| [`apps/gratitude`](apps/gratitude/README.md) | Daily gratitude journal — captures mood, reflection, and gratitude entries |

## Project Structure

```
apps/
  gratitude/          # Gratitude journal app
    public/           # Static frontend (HTML, CSS, JS)
    lib/
      reflection-prompt/   # AI reflection question pipeline
      journal-analytics/   # Streak and quest tracking
    openclaw/         # Open Claw agent config and SOUL.md
    server.js         # Express server + Notion API routes
    package.json

docker/               # Local development stack
  docker-compose.yml  # App + Ollama + nginx
  gratitude.Dockerfile
  nginx/
  envs/               # .env.*.example files (copy and fill in)
```

## Docker Dev Setup

```bash
cp docker/envs/.env.gratitude.example docker/envs/.env.gratitude
cp docker/envs/.env.ollama.example docker/envs/.env.ollama
# fill in values, then:
docker compose -f docker/docker-compose.yml up --build
```

See [`docker/README.md`](docker/README.md) for full setup details.

## Open Claw

Each app's `openclaw/` directory contains:
- `SOUL.md` — the agent's personality and instructions
- `openclaw-config-fragment.json5` — Telegram command registrations to merge into `~/.openclaw/openclaw.json`

See individual app READMEs for agent setup steps.
