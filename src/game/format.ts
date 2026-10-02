const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']

/** Compact retro number formatting: 999, 1.23K, 45.6M ... */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '---'
  if (n < 0) return '-' + fmt(-n)
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1).replace(/\.0$/, '') : Math.floor(n).toString()
  const tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3))
  const scaled = n / Math.pow(1000, tier)
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
  return scaled.toFixed(digits) + SUFFIXES[tier]
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/** ASCII progress bar: [#####-----] */
export function asciiBar(fraction: number, width: number, full = '█', empty = '░'): string {
  const f = Math.max(0, Math.min(1, fraction))
  const n = Math.round(f * width)
  return full.repeat(n) + empty.repeat(width - n)
}
