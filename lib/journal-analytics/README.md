# Journal Analytics (Quest Engine)

This module provides deterministic journaling analytics plus a quest system.

## What It Computes

File: `lib/journal-analytics/gameTheory.js`

- Core scores: `cooperation`, `defectionRisk`, `exploration`, `nashBalance`
- Streaks: current + longest
- Writing metrics: reflection depth, gratitude breadth, vocabulary diversity
- Theme coverage and sentiment trend
- Quest board: **66 quests** with per-quest progress and completion eligibility

## Quest Model

The quest catalog is rule-based and grouped by milestones:

- streak milestones
- total entry milestones
- reflection depth milestones
- consistency-rate milestones
- theme-coverage milestones
- cooperation-score milestones
- active-day milestones

Each quest includes:

- `id`
- `title`
- `category`
- `target`
- `progress`
- `rewardXp`
- `done` (computed eligibility)

## Quest Persistence

Quest completion is persisted client-side in browser `localStorage`:

- `gratitude.quest.state.v1` stores sticky completion states
- once a quest is marked done, it remains done locally

Server analytics stays stateless and deterministic; no extra Notion DB is used for quest stats.

## API Flow

`GET /api/analytics`:

1. Reads journal entries from main entries DB
2. Runs deterministic analytics + quest progress
3. Returns analytics payload (quests + scores)

## Does It Use AI?

No. This analytics and quest system is fully rule-based.

AI is only used elsewhere for reflection-question generation (`/api/prompt` via Ollama).
