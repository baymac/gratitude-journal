# Gratitude Journal - Claude Code Guide

## Project Overview
Minimal gratitude journal web app backed by the Notion API. Express server proxies Notion calls for a static HTML/CSS/JS frontend.

## Architecture
- `server.js` — Express server, Notion API routes, serves static files from `public/`
- `public/index.html` — Single-page app with three views: list, detail, form
- `public/style.css` — Dark theme, Space Mono for headings, Inter for body
- `public/app.js` — Frontend state management, fetch calls, view switching
- `.env` — `NOTION_API_KEY`, `NOTION_PAGE_ID`, `PORT`

## Notion Data Model
A child database ("Gratitude Entries") is auto-created under the configured page.
Properties: `Day` (title, string number), `Date` (date), `Feeling` (rich_text), `Mistake` (rich_text), `GratefulFor` (rich_text).

## API Routes
- `GET /api/entries` — List all entries (sorted by date desc)
- `GET /api/entries/:id` — Get single entry
- `POST /api/entries` — Create entry (body: `{ day, date, feeling, mistake, gratefulFor }`)
- `PUT /api/entries/:id` — Update entry
- `DELETE /api/entries/:id` — Archive entry in Notion

## Commands
- `npm start` — Run the server
- No build step, no tests currently

## Style Conventions
- Spaced-letter headings use `letter-spacing` with Space Mono font
- Date format displayed as `YY/MM/DD`
- Dark theme with gold accent (`#c9a86c`)
