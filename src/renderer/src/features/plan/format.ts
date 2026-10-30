/** "ne 2. 11." – compact Czech date for lists. */
export function formatPlanDate(date: string): string {
  if (!date) return 'Šablona'
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Date(y, m - 1, d).toLocaleDateString('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric'
  })
}

/** "neděle 2. listopadu 2026" – long form for headings. */
export function formatPlanDateLong(date: string): string {
  if (!date) return 'Šablona'
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Date(y, m - 1, d).toLocaleDateString('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}
