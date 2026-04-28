# FlashTimer

A browser-based trainer for tracking enemy Flash (and any 5-minute cooldown) in League of Legends. Simulates the LoL chat so you can drill the muscle memory of logging timers quickly under distraction.

**Play it:** https://gronuj.github.io/flashtimer/

## How it works

1. Start a session — pick clock speed, flash frequency, length (3 / 5 / 10 min or unlimited), and optional modes.
2. Enemy flashes pop up as chat messages (e.g. `14:20 Jgl (Jgl): Mid used Flash`).
3. Press `Enter`, type the return time as `role + MMSS` (flash time + 5:00), press `Enter` again. Example: a Mid Flash at `14:20` → type `mid1920`. ADC accepts `adc`/`ad`, jungle accepts `jgl`/`jg`. The logging window depends on Flash Frequency: 5s (insane) / 10s (high) / 15s (medium) / 20s (low).
4. Catch it in time to score; build a streak for multipliers and climb the rank badge (Iron → Challenger). Misses cost a small amount (`-50` score, `-1` streak, `-1` bubble stack) but no longer wipe progress.
5. Session ends with a results screen; your score per session is charted in Stats.

### Bubble minigame

Between flashes, gold bubbles pop up at random screen positions for ~1.2s. Click them to:

- gain `+25` score and **+1 stack to the bubble bank** (uncapped — high stacks are the goal),
- each stack adds `+0.2x` multiplier *on top of* the streak multiplier (multiplicative), e.g. streak 5 with 10 banked bubbles = `2.0x × 3.0x = 6.0x` on the next catch,
- click pitch climbs slowly with stack count so you can hear depth grow.

The bubble game **pauses and clears all on-screen bubbles the moment any flash is active** — flashes always take priority. Stacks erode one at a time on misses, so banking bubbles is a long-term investment that risks evaporation if you sleep on a timer.

## Modes

- **Clock speed** (1x / 2x / 5x / 10x) — how fast the game clock advances, independent of the catch window. Past 45:00 the clock soft-resets to a fresh early-game window once outstanding flashes are resolved (since flash + 5:00 wraps past the 4-digit input format).
- **Flash frequency** (insane / high / medium / low) — how often events spawn, and how long you have to log each one (5 / 10 / 15 / 20 real-time seconds).
- **Hidden timers (hardcore)** — chat hides the exact time the Flash went out; you calculate it.
- **Simultaneous spells (teamfights)** — occasional double flashes.
- **Fake chat distractions** — teammate spam to filter out while you track.
- **Sound cues** — short WebAudio blips for flash spawns, catches (pitch rises with streak), misses, and bubble pops (pitch rises with bank). No audio assets, fully synthesized.

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
