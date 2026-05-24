export function getDefaultDateRange(): { from: string; to: string } {
  const today = new Date()
  const lastWeek = new Date(today)
  lastWeek.setDate(today.getDate() - 6)
  return { from: toIsoDate(lastWeek), to: toIsoDate(today) }
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function filterActivitiesByDateRange<T extends { startDate: string }>(
  items: T[],
  fromIso: string,
  toIso: string,
): T[] {
  if (!fromIso && !toIso) return items
  return items.filter((item) => {
    const day = item.startDate.slice(0, 10)
    if (fromIso && day < fromIso) return false
    if (toIso && day > toIso) return false
    return true
  })
}
