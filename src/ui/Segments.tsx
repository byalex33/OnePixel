/** Segmented block bar - an ASCII progress bar drawn with squares. */
export function Segments({
  value,
  count,
  className = '',
  fill = 'var(--color-hi)',
}: {
  value: number
  count: number
  className?: string
  fill?: string
}) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * count)
  return (
    <div className={`flex gap-[2px] ${className}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="h-full flex-1" style={{ background: i < filled ? fill : 'var(--color-line)' }} />
      ))}
    </div>
  )
}
