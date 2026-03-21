/**
 * CSV関連の共通ユーティリティ
 */

/** CSVテキストをパースして2次元配列を返す（クォート対応） */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(current.trim())
        current = ''
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        row.push(current.trim())
        if (row.some(c => c !== '')) rows.push(row)
        row = []
        current = ''
      } else {
        current += ch
      }
    }
  }
  row.push(current.trim())
  if (row.some(c => c !== '')) rows.push(row)
  return rows
}

/** 日付文字列を正規化 (yyyy-mm-dd) */
export function normalizeDate(val: string): string | null {
  if (!val) return null
  // yyyy/mm/dd or yyyy-mm-dd
  const m1 = val.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`
  // 和暦: 昭和XX年MM月DD日 etc
  const eraMatch = val.match(/(明治|大正|昭和|平成|令和)(\d{1,2})年(\d{1,2})月(\d{1,2})日/)
  if (eraMatch) {
    const eraYear: Record<string, number> = { '明治': 1868, '大正': 1912, '昭和': 1926, '平成': 1989, '令和': 2019 }
    const year = eraYear[eraMatch[1]] + parseInt(eraMatch[2]) - 1
    return `${year}-${eraMatch[3].padStart(2, '0')}-${eraMatch[4].padStart(2, '0')}`
  }
  // yyyy年mm月dd日
  const m2 = val.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`
  // mm/dd/yyyy
  const m3 = val.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m3) return `${m3[3]}-${m3[1].padStart(2, '0')}-${m3[2].padStart(2, '0')}`
  return null
}

/** 金額文字列を数値に変換 */
export function normalizePrice(val: string): number {
  if (!val) return 0
  const cleaned = val
    .replace(/[\\¥￥円,、]/g, '')
    .replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .trim()
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? 0 : num
}

/** 支払方法を正規化 */
export function normalizePaymentMethod(val: string): string {
  const v = val.trim().toLowerCase()
  if (['現金', 'cash', 'げんきん'].includes(v)) return '現金'
  if (['カード', 'card', 'クレジット', 'クレジットカード', 'credit'].includes(v)) return 'カード'
  if (['qr', 'qr決済', 'paypay', 'ペイペイ', 'linepay', 'd払い', 'バーコード'].includes(v)) return 'QR決済'
  if (['回数券', 'チケット', 'ticket', 'coupon'].includes(v)) return '回数券'
  if (['振込', '振り込み', 'transfer', '銀行'].includes(v)) return '振込'
  if (v === '' || v === '-') return '現金'
  return val.trim() || '現金'
}

/** 施術時間を数値（分）に変換 */
export function normalizeDuration(val: string): number {
  if (!val) return 0
  // "60分" → 60
  const minMatch = val.match(/(\d+)\s*分/)
  if (minMatch) return parseInt(minMatch[1], 10)
  // "1時間" → 60, "1時間30分" → 90
  const hourMatch = val.match(/(\d+)\s*時間/)
  if (hourMatch) {
    let mins = parseInt(hourMatch[1], 10) * 60
    const extraMin = val.match(/(\d+)\s*分/)
    if (extraMin) mins += parseInt(extraMin[1], 10)
    return mins
  }
  const num = parseInt(val, 10)
  return isNaN(num) ? 0 : num
}

/** ファイル読み込み（UTF-8→Shift-JIS自動判定）*/
export function readFileWithEncoding(
  file: File,
  onResult: (text: string) => void
) {
  const reader = new FileReader()
  reader.onload = (ev) => {
    const text = ev.target?.result as string
    if (text.includes('\uFFFD') || /[\x00-\x08]/.test(text.substring(0, 200))) {
      const reader2 = new FileReader()
      reader2.onload = (ev2) => {
        onResult(ev2.target?.result as string)
      }
      reader2.readAsText(file, 'Shift_JIS')
    } else {
      onResult(text)
    }
  }
  reader.readAsText(file, 'UTF-8')
}

/** 全角スペースを半角に統一 */
export function normalizeSpaces(val: string): string {
  return val.replace(/\u3000/g, ' ').trim()
}
