# Gratitude Journal

A minimal dark-themed gratitude journal app that stores entries in Notion.

Each entry captures:
- **Day number & date**
- **How you're feeling**
- **An AI-generated reflection question**
- **What you're grateful for**

## Setup

### 1. Create a Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **New integration**
3. Name it (e.g. "Gratitude Journal"), select your workspace
4. Copy the **Internal Integration Secret** (`secret_...`)

### 2. Connect Integration to Your Page

1. Open your **Gratitude Journal** page in Notion
2. Click the `...` menu (top right) → **Connections** → Add your integration
3. Copy the **Page ID** from the URL — it's the 32-character hex string after the page name:
   ```
   https://notion.so/Gratitude-Journal-abc123def456...
                                        ^^^^^^^^^^^^^^^^ this part
   ```

### 3. Configure Environment

```bash
cp docker/envs/.env.gratitude.example docker/envs/.env.gratitude
```

Fill in your values:
```
NOTION_API_KEY=secret_your_key_here
NOTION_PAGE_ID=your_page_id_here
PORT=3000
```

### 4. Run

```bash
# from repo root
docker compose -f docker/docker-compose.yml up --build
# open http://localhost
```

Or without Docker:
```bash
cd apps/gratitude
npm install
npm start
```

## Usage

- **Home** — Lists all entries sorted by date
- **Analytics** — Scores consistency and tracks a 66-quest board with completion checkmarks
- **+ button** — Create a new entry
- **Click an entry** — View full details
- **Edit / Delete** — Available on each entry's detail view

The app automatically creates a "Gratitude Entries" database inside your Notion page on first use.

## Open Claw Integration

[Open Claw](https://openclaw.ai) runs on the same VPS as this server and acts as the Telegram gateway. Its AI agent handles the multi-turn conversation with the user; this server just exposes stateless REST endpoints the agent calls.

### How it works

```
Telegram user
    ↓  /log_gratitude or /analytics_gratitude
Open Claw (Telegram gateway)
    ↓  routes to the configured agent
Open Claw AI agent  ←  reads openclaw/SOUL.md
    ↓  conducts conversation, then calls:
Gratitude server (http://localhost:3000)
```

### Agent setup

1. Copy `openclaw/SOUL.md` into your Open Claw agent's workspace directory.
2. Merge the settings in `openclaw/openclaw-config-fragment.json5` into `~/.openclaw/openclaw.json` — it registers the Telegram commands and points the agent at the workspace.
3. Restart Open Claw.

### API endpoints used by the agent

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/open-claw/prompt` | Get today's reflection question. Returns `{ alreadyLogged, reflectionQuestion, reflectionPrompt }` |
| `POST` | `/api/open-claw/log-gratitude` | Save a completed entry. Body: `{ feeling, reflection, reflectionQuestion, reflectionPrompt, gratefulFor }` |
| `GET` | `/api/open-claw/analytics` | Plain-text analytics summary, ready to paste into Telegram |

### Telegram commands

| Command | Description |
|---------|-------------|
| `/log_gratitude` | Guided multi-turn journaling flow for today |
| `/analytics_gratitude` | Snapshot of your journaling stats |

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JS
- **Backend:** Node.js, Express
- **Storage:** Notion API (`@notionhq/client`)
- **AI prompts:** Ollama (local LLM)

## Screenshots

### Home (Entries List)

![Home screen](docs/screenshots/app-home.png)

### Add New Entry

![Add new entry screen](docs/screenshots/app-new-entry.png)
