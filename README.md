# FlashTimer

A browser-based trainer for tracking enemy Flash (and any 5-minute cooldown) in League of Legends. Simulates the LoL chat so you can drill the muscle memory of logging timers quickly under distraction.

**Play it:** https://gronuj.github.io/flashtimer/

## How it works

1. Start a session — pick clock speed, flash frequency, length (3 / 5 / 10 min or unlimited), and optional modes.
2. Enemy flashes pop up as chat messages (e.g. `14:20 Jgl (Jgl): Mid used Flash`).
3. Press `Enter`, type the return time as `role + MMSS` (flash time + 5:00), press `Enter` again. Example: a Mid Flash at `14:20` → type `mid1920`. ADC accepts both `adc` and `ad`. You have 15 real-time seconds to log a flash before it's counted as a miss.
4. Catch it in time to score; build a streak for multipliers and climb the rank badge (Iron → Challenger).
5. Session ends with a results screen; your score per session is charted in Stats.

## Modes

- **Clock speed** (1x / 2x / 5x / 10x) — how fast the game clock advances. The catch window is a fixed 15 real-time seconds, independent of speed. Past 45:00 the clock soft-resets to a fresh early-game window once outstanding flashes are resolved (since flash + 5:00 wraps past the 4-digit input format).
- **Flash frequency** (insane / high / medium / low) — how often events spawn.
- **Hidden timers (hardcore)** — chat hides the exact time the Flash went out; you calculate it.
- **Simultaneous spells (teamfights)** — occasional double flashes.
- **Fake chat distractions** — teammate spam to filter out while you track.

## Run locally

Requires Python ≥ 3.13 and [uv](https://docs.astral.sh/uv/).

```
uv run uvicorn main:app --reload
```

Then open http://127.0.0.1:8000/.

The backend is only a thin FastAPI shim that serves the `static/` directory; all game logic lives in `static/script.js`.

## Stack

- Vanilla JS / HTML / CSS — no framework, no build step.
- FastAPI (local dev only).
- Inline SVG for branding and charts.
- `localStorage` for stats persistence.

## Credits

Not affiliated with Riot Games. FlashTimer is a fan-made practice tool.
