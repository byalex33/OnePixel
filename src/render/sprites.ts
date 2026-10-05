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

/** Mushroom cloud shown above "NUKED". 1 fire, 2 hot top, 3 shadow, 4 stem. */
export const MUSHROOM: Sprite = [
  '....22222....',
  '..221111122..',
  '.21111111112.',
  '2111111111112',
  '3111111111113',
  '.33311111333.',
  '....33133....',
  '.....414.....',
  '...3341433...',
  '.....414.....',
  '.....414.....',
  '...1144411...',
  '.11111111111.',
  '3333333333333',
]

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
