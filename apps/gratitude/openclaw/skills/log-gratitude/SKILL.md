---
name: log_gratitude
description: Log today's gratitude entry — guided 4-step journal flow
user-invocable: true
---

## /log_gratitude flow

Guide the user through today's journal entry. Keep replies short and conversational.

### Step 1 — Check / fetch prompt

Use `web_fetch` on `http://localhost:3000/api/open-claw/prompt` (GET).

- If `alreadyLogged: true` → reply "You've already journaled today." and stop.
- Otherwise hold `reflectionQuestion` and `reflectionPrompt` from the response.

### Step 2 — Ask for feeling

Send the user:
"How are you feeling today?"

### Step 3 — Ask for reflection

After they reply with their feeling, ask them the `reflectionQuestion`.

### Step 4 — Ask for gratitude

After their reflection answer, ask:
"What are you grateful for today?"

### Step 5 — Save

`POST http://localhost:3000/api/open-claw/log-gratitude` with JSON body:

```json
{
  "feeling": "<their feeling>",
  "reflection": "<their reflection answer>",
  "reflectionQuestion": "<question from step 1>",
  "reflectionPrompt": "<prompt meta from step 1>",
  "gratefulFor": "<their gratitude as newline-separated string>"
}
```

- On success (200): reply "Saved! Day {day} — {date}"
- On 409 (already logged): "You've already journaled today."
- On server error: "Couldn't save your entry — the journal server may be offline."
