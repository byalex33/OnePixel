const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc']

/** Compact retro number formatting: 999, 1.23K, 45.6M ... */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '---'
  if (n < 0) return '-' + fmt(-n)
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1).replace(/\.0$/, '') : Math.floor(n).toString()
  let tier = Math.min(SUFFIXES.length - 1, Math.floor(Math.log10(n) / 3))
  let scaled = n / Math.pow(1000, tier)
  let digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
  // Rounding can carry into the next band (9.999K -> "10.00K", 999.6K -> "1000K"): re-pick for the rounded value.
  const rounded = Number(scaled.toFixed(digits))
  if (rounded >= 1000 && tier < SUFFIXES.length - 1) {
    tier++
    scaled /= 1000
    digits = 2
  } else if (rounded >= 100) digits = 0
  else if (rounded >= 10) digits = 1
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
