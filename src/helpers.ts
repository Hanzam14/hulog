export function money(centavos: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100)
}
export function parsePesos(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter pesos with up to two decimal places.')
  const [whole, fraction = ''] = value.trim().split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Enter a positive amount.')
  return result
}
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function phaseDisplay(phase: string, daysLeft: number): string {
  if (phase === 'open') return `Open · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`
  return ({ upcoming: 'Upcoming · paying ahead is okay', settling: 'Settling · last day to confirm', ended: 'Ended', proposed: 'Waiting for agreement', declined: 'Declined', cancelled: 'Cancelled' } as Record<string, string>)[phase] ?? phase
}
export function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const cell = (value: unknown) => {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    // Spreadsheet apps can execute cells beginning with these characters.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }
  return [keys.map(cell).join(','), ...rows.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n')
}
