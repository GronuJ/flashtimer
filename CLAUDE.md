# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FlashTimer is a browser-based practice tool that simulates the League of Legends chat so the user can drill tracking enemy summoner-spell (Flash) timers. The Python side is a near-trivial FastAPI shim; essentially all logic lives in the frontend.

## Running

```bash
uv run uvicorn main:app --reload
```

Then open http://127.0.0.1:8000/ — `/` redirects to `/static/index.html`. There is no build step; edit files under `static/` and reload.

`jsdom` is listed in `package.json` but nothing currently uses it (no tests, no build). Treat it as vestigial unless the user says otherwise.

## Architecture

- `main.py` — FastAPI app that only mounts `static/` and redirects `/` to the HTML. Don't put game logic here.
- `static/index.html` — single-page UI: start screen with settings, in-game HUD (clock, score, streak), chat HUD, and two modals (stats, info).
- `static/script.js` — **all game logic, one module, plain DOM APIs**, no framework/bundler. Key state lives in module-scoped `let`s near the top:
  - `expectedFlashes` — dict keyed by role (`mid`, `top`, …) tracking which flashes are currently "open" for scoring and their deadlines.
  - `gameTimeSeconds` + `clockInterval` — the in-game clock, which runs faster than real time based on the `clockSpeed` setting (1x/2x/5x/10x). **Scoring windows are in in-game seconds, but flash-spawn intervals in the UI copy are described in real-time seconds** — keep that distinction when changing timing logic.
  - `score`, `streak`, and a `stats` object persisted to `localStorage` under the key `flashTimerStats`.
- `static/style.css` — styling for the LoL-chat look.

### Input/scoring contract

The user types strings like `mid1420` into the chat input: role prefix + four-digit timer (minutes+seconds when Flash should come back up = flash time + 5:00). `script.js` parses that, matches it against `expectedFlashes[role]`, and awards/breaks streak based on whether it's within the allowed window. When editing parsing or scoring, preserve this exact input format — it's user muscle memory.

### Modes (checkboxes on start screen)

- Hardcore — hides the timer hints.
- Teamfight — multiple simultaneous flashes.
- Distraction — injects fake chat lines via `distractionInterval`.

These are flags read at session start; changing them mid-session is not supported.

## Conventions

- Plain JS, no build tooling — don't introduce a bundler, TS, or a framework unless asked.
- Python deps via `uv` only (`uv add …`), never pip.
