# OpenClaw Integration

This directory contains the OpenClaw agent configuration for the Gratitude Journal.

## Files

| File | Purpose |
|------|---------|
| `SOUL.md` | Agent instructions — the persona and task definitions loaded into every session |
| `openclaw-config-fragment.json5` | Partial config that gets merged into `~/.openclaw/openclaw.json` on the server |
| `install-openclaw.sh` | Installer script — run once on the server to wire everything up |

---

## What `install-openclaw.sh` does

Run it from the repo on the server:

```bash
bash apps/gratitude/openclaw/install-openclaw.sh
```

### Step-by-step

**1. Create the agent workspace**
Creates `~/.openclaw/workspace-gratitude/` if it doesn't exist. This is the dedicated directory openclaw uses as the agent's working directory — runtime files like `HEARTBEAT.md`, `BOOTSTRAP.md`, and session memory go here, keeping them out of the repo.

**2. Deploy `SOUL.md`**
Copies `SOUL.md` from the repo into `~/.openclaw/workspace-gratitude/SOUL.md`. OpenClaw loads this file at the start of every agent session to give the agent its persona and task instructions. The repo copy is the source of truth — re-run the script after editing it.

**3. Parse the config fragment**
Reads `openclaw-config-fragment.json5`, strips comments, and parses it as JSON. The fragment defines:
- The `gratitude` agent entry (id, model, tools)
- The Telegram channel binding that routes all Telegram messages to the gratitude agent
- The two Telegram slash commands (`/log_gratitude`, `/analytics_gratitude`)

**4. Set the workspace path**
Injects the absolute path to `~/.openclaw/workspace-gratitude` into the agent entry before merging, so the config fragment doesn't need to hard-code a server path.

**5. Deep-merge into `openclaw.json`**
Reads the existing `~/.openclaw/openclaw.json` (or starts from `{}` if absent) and merges the fragment into it. The merge is non-destructive:
- Scalar values are overwritten
- Objects are merged recursively
- Arrays are replaced wholesale, **except** `agents.list` which is upserted by `id` — so the gratitude agent entry is updated without touching other agents

**6. Restart the gateway**
If `openclaw` is already running, kills it and relaunches `openclaw gateway` in the background. If it isn't running, prints the manual start command.

### After running

```
✓ SOUL.md deployed to /root/.openclaw/workspace-gratitude
✓ Config updated: /root/.openclaw/openclaw.json
✓ openclaw restarted
```

To update the agent instructions, edit `SOUL.md` in the repo and re-run the script.

---

## Why an Agent, not a ClawHub Skill

OpenClaw has two distinct extension mechanisms. Here is why this integration uses an **agent** rather than a **skill**.

### What a skill is

A skill is a teaching module — a `SKILL.md` file (optionally with supporting files) that tells an existing agent how to use specific tools. Skills from ClawHub (the public registry) work the same way as local skills: they add capability to whichever agent is currently active.

Skills:
- Run inside an existing agent's context
- Inherit the parent agent's model, workspace, and session
- Can expose slash commands, gate on env vars, be versioned and shared
- Cannot have their own dedicated model
- Cannot be the target of a channel binding

### What an agent is

An agent is a runtime entity with its own identity, workspace, model, and session state. Channel bindings (`bindings` in `openclaw.json`) route messages from a channel (e.g. Telegram) to a specific agent by `id`.

### Why the gratitude integration requires an agent

| Requirement | Skill | Agent |
|------------|-------|-------|
| Route all Telegram messages to this integration | No — bindings target agent IDs only | Yes |
| Use a specific model (Haiku) separate from the default | No — inherits parent model | Yes |
| Custom persona via `SOUL.md` in an isolated workspace | No | Yes |
| Persistent session state per Telegram conversation | No | Yes |

The Telegram binding (`{ agentId: "gratitude", match: { channel: "telegram" } }`) is the key constraint. There is no equivalent concept for skills — you cannot bind a channel to a skill. The agent wrapper is required for routing, and once you have an agent you also get model isolation and a dedicated workspace for free.

A ClawHub skill could potentially be used *inside* the gratitude agent in the future (e.g., a community Notion skill), but the agent itself is always necessary.
