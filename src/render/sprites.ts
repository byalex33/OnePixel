/** Tiny bitmap sprites. Each character maps to a colour; '.' is transparent. */
export type Sprite = string[]

export const CURSOR: Sprite = [
  '1......',
  '11.....',
  '121....',
  '1221...',
  '12221..',
  '122221.',
  '1222111',
  '1221...',
  '11.21..',
  '1..121.',
  '....11.',
]

export const BOMB: Sprite = [
  '....3.',
  '...4..',
  '.111..',
  '12111.',
  '11111.',
  '.111..',
]

/**
 * Sitting fox, facing right, one character per background dot.
 * o = fur, w = white chest / tail tip, . = empty (the gap at row 2 is the eye).
 * Two frames give the tail wag; rows must stay the same width.
 */
export const FOX_TAIL_UP: Sprite = [
  '......o.o..',
  '......ooo..',
  '.....oo.ooo',
  '.....owwww.',
  'w...ooww...',
  'ow..ooow...',
  'oo.ooooo...',
  '.ooooooo...',
  '...oo.oo...',
]

export const FOX_TAIL_DOWN: Sprite = [
  '......o.o..',
  '......ooo..',
  '.....oo.ooo',
  '.....owwww.',
  '....ooww...',
  '....ooow...',
  'ww.ooooo...',
  'oooooooo...',
  '...oo.oo...',
]

export const HEART: Sprite = ['.1.1.', '11111', '11111', '.111.', '..1..']

/** Row and column of the eye in the sitting fox sprites (filled in when it blinks). */
export const FOX_EYE = { r: 2, c: 7 }

/** Walking fox, facing right. Two frames alternate the legs; also used mid-leap. */
export const FOX_WALK_A: Sprite = [
  '.........o.o',
  '.........ooo',
  'ww......oo.o',
  '.oo.....oooo',
  '..oooooooww.',
  '...oooooow..',
  '...o.o..o.o.',
]

export const FOX_WALK_B: Sprite = [
  '.........o.o',
  '.........ooo',
  'ww......oo.o',
  '.oo.....oooo',
  '..oooooooww.',
  '...oooooow..',
  '....oo...oo.',
]

export const FOX_WALK_EYE = { r: 2, c: 10 }

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  bit: number,
  colors: Record<string, string>,
): void {
  for (const key in colors) {
    ctx.fillStyle = colors[key]
    for (let r = 0; r < sprite.length; r++) {
      const row = sprite[r]
      for (let c = 0; c < row.length; c++) {
        if (row[c] === key) ctx.fillRect(Math.round(x + c * bit), Math.round(y + r * bit), bit, bit)
      }
    }
  }
}
