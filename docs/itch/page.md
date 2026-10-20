# itch.io page

The copy and settings for the OnePixel page on itch.io. Images in this folder are rendered by `npm run itch-art`; the game zip comes from `npm run itch`.

## Settings

| Field | Value |
| --- | --- |
| Title | OnePixel |
| Short description | There is one pixel. Click it. |
| Classification | Games |
| Kind of project | HTML |
| Release status | Released |
| Upload | `release/onepixel-web-<version>.zip`, ticked "This file will be played in the browser" |
| Embed | Embed in page, 960 x 600, "Mobile friendly" (landscape and portrait), fullscreen button on, "Automatically start on page load" off |
| Genre | Simulation |
| Tags | clicker, incremental, idle, pixel-art, retro, minimalist, boss-battle, chiptune, 2d, singleplayer |
| Inputs | Mouse, Touchscreen |
| AI disclosure | Yes |
| Cover image | `cover.png` (1260 x 1000, 2x the 630 x 500 slot) |
| Screenshots | `first-pixel.png`, `lasers.png`, `rainbow.png`, `boss.png`, `pixel-zero.png`, `nuke.png` |
| Theme | Background `#171717`, text `#d4d4d4`, links `#ffcc33`, buttons `#f2f2f2`; banner `banner.png` |

## Description

**There is one pixel. Click it.**

OnePixel is a retro dot-matrix incremental game about destroying a single pixel. Then a few more. Then rather a lot of them.

It opens on an empty screen with exactly one pixel and a hand-drawn arrow that says *click me!*. Pop it and you get a pixel. It comes back. Pop it again. Before long the arena is full of drones, bombs, orbital lasers, storms of falling pixels and, eventually, a nuke.

### How it plays

- **Click (or tap) pixels.** Each one explodes and pays out pixels and XP.
- **Level up.** Every level unlocks a new mechanic rather than a bigger number: crits, combos, explosive taps, chain reactions, drones, bombs, lasers, pixel rain, the nuke.
- **Buy upgrades.** Every new mechanic does nothing until you buy its first level, so you choose what to switch on and when.
- **Automate.** Drones, bombs and lasers keep destroying pixels while you watch, or while you are away.
- **Fight what surfaces.** Past level 20, something starts climbing out of the grid. Destroy it before it burrows back down.

### Features

- Chunky pixel-particle explosions, screen shake, hit-stop on crits and floating reward numbers
- Golden pixels worth x25, blue pixels worth x10 XP, and rainbow mode, where every pixel pays x10 or more and the screen lights up like an RGB keyboard
- A dot-matrix landscape that grows in behind the arena as you level
- Bosses, a final boss, and a REBOOT that starts you over with everything worth more
- 28 achievements, each worth +2% pixel value
- Synthesised chiptune sound effects and music
- Plays well on phones as well as desktops
- Autosaves in your browser, with offline progress and save codes you can export

### Controls

Click or tap pixels. Tap a bomb to set it off early. Tap an upgrade to buy one level, hold it to keep buying, or hit **MAX** to buy every level you can afford.

### Credits

Made by Alex (alex.codes). Fonts: Press Start 2P by CodeMan38, VT323 by Peter Hull and Caveat by Impallari Type, under the SIL Open Font License 1.1. Icons from game-icons.net by Lorc, Delapouite and contributors, under CC BY 3.0. Sound and music are synthesised live in your browser.

### Source code

OnePixel is open source under the MIT License: [github.com/byalex33/OnePixel](https://github.com/byalex33/OnePixel). Fork it, mod it, make your own version.
