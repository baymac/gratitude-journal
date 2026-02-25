# Repository Guidelines

## Project Structure & Module Organization
This project is a small Node.js + Express app with a vanilla frontend.

- `server.js`: backend entry point, API routes (`/api/entries`, `/api/prompt`), Notion and Ollama integration.
- `public/index.html`: app shell and view markup.
- `public/app.js`: client-side state, view switching, fetch calls, CRUD actions.
- `public/style.css`: theme and component styles.
- `README.md`: setup and runtime instructions.
- `.env.example`: required environment variables template.

There is currently no `src/` split and no test directory.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm start`: run the Express server on `PORT` (default `3000`).
- `npm test`: currently a placeholder and exits with an error by design.

Local run flow:
```bash
cp .env.example .env
npm install
npm start
```

## Coding Style & Naming Conventions
- Use 2-space indentation in frontend files and keep JS readable and explicit.
- Prefer `const`/`let`, avoid implicit globals, and keep functions focused.
- Backend uses `camelCase` for variables/functions and uppercase for constants (for example, `OLLAMA_MODEL`).
- Keep API field names aligned with Notion properties: `Day`, `Date`, `Feeling`, `Reflection`, `ReflectionPrompt`, `GratefulFor`.
- Match existing file naming: lowercase (`server.js`, `app.js`, `style.css`).

## Testing Guidelines
No automated test framework is set up yet. Until one is added:
- Manually verify create/read/update/delete entry flows in the UI.
- Confirm `/api/prompt` behavior both when Ollama is available and unavailable (fallback prompts).
- Validate `.env` values (`NOTION_API_KEY`, `NOTION_PAGE_ID`, `PORT`) before testing.

If tests are introduced, place them under `tests/` and use `*.test.js` naming.

## Commit & Pull Request Guidelines
Git history is not available in this workspace snapshot, so no existing commit convention can be inferred. Use:
- Conventional-style commit messages (for example, `feat: add prompt fallback handling`).
- Small, focused commits with clear intent.

For pull requests, include:
- What changed and why.
- Setup or env changes.
- Screenshots/GIFs for UI updates.
- Manual verification steps performed.

## Security & Configuration Tips
- Never commit `.env` or secrets.
- Treat Notion API credentials as sensitive.
- Keep `NOTION_PAGE_ID` and integration permissions scoped to the intended page/workspace.
