# OnePixel

There is one pixel. Click it.

A retro dot-matrix incremental game. Pop the pixel, earn pixels and XP, and level up to stock the shop with increasingly ridiculous ways to destroy more pixels: crits, combos, drones, a pixel-hunting fox, bombs, lasers, pixel rain and, eventually, a nuke.

## Run it

```bash
npm install
npm run dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (game maths, progression, saves, pacing) |
| `npm run balance` | Simulated players; prints the levelling timeline |

## Deploy

Static site. On Cloudflare Pages use build command `npm run build` and output directory `dist`, or run `npx wrangler deploy` after building (see `wrangler.jsonc`).

## Layout

- `src/game` - the simulation: fixed-tick engine, formulas, upgrades, levels, achievements, saves, offline progress. No DOM, no React.
- `src/render` - canvas renderer: dot-matrix scenery, particles, sprites.
- `src/audio` - WebAudio synth cues mapped from game events.
- `src/app` - runtime glue: game loop, autosave, offline progress.
- `src/ui` - React + Tailwind interface.

Saves are local-first (localStorage) with export/import codes.
