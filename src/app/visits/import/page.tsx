'use client'

import { useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'
import { findAllMatches, type PatientCandidate } from '@/lib/nameMatch'
import {
  parseCSV, normalizeDate, normalizePrice, normalizePaymentMethod,
  normalizeDuration, normalizeSpaces, readFileWithEncoding,
} from '@/lib/csvUtils'

// CSVヘッダー → DBカラムのマッピング辞書
const SLIP_HEADER_MAP: Record<string, string> = {
  // 日本語ヘッダー
  '来院日': 'visit_date', '来店日': 'visit_date', '施術日': 'visit_date', '日付': 'visit_date', '受付日': 'visit_date', '日': 'visit_date',
  '患者名': 'patient_name', '氏名': 'patient_name', 'お名前': 'patient_name', '名前': 'patient_name', '顧客名': 'patient_name',
  '施術内容': 'menu_name', 'メニュー': 'menu_name', '施術名': 'menu_name', 'コース': 'menu_name', '施術メニュー': 'menu_name',
  '金額': 'total_price', '売上': 'total_price', '合計': 'total_price', '料金': 'total_price', '施術料': 'total_price', '合計金額': 'total_price', '請求額': 'total_price',
  '基本料金': 'base_price', '基本金額': 'base_price',
  'オプション': 'option_names', 'オプション名': 'option_names',
  'オプション料金': 'option_price', 'オプション金額': 'option_price',
  '支払方法': 'payment_method', '決済方法': 'payment_method', '支払い方法': 'payment_method', '支払': 'payment_method',
  '担当者': 'staff_name', 'スタッフ': 'staff_name', '施術者': 'staff_name', '担当': 'staff_name',
  '所要時間': 'duration_minutes', '時間': 'duration_minutes', '施術時間': 'duration_minutes',
  '値引き': 'discount', '割引': 'discount', '割引額': 'discount',
  '税': 'tax', '消費税': 'tax', '税額': 'tax',
  '備考': 'notes', 'メモ': 'notes', 'ノート': 'notes',
  // CSS英語ヘッダー
  'OperationDate': 'visit_date', 'Date': 'visit_date', 'VisitDate': 'visit_date',
  'PatientName': 'patient_name', 'Name': 'patient_name', 'CustomerName': 'patient_name',
  'MenuName': 'menu_name', 'OperationName': 'menu_name', 'Menu': 'menu_name', 'Treatment': 'menu_name',
  'Price': 'total_price', 'TotalPrice': 'total_price', 'Amount': 'total_price', 'Total': 'total_price',
  'BasePrice': 'base_price',
  'OptionName': 'option_names', 'Options': 'option_names',
  'OptionPrice': 'option_price',
  'PaymentMethod': 'payment_method', 'Payment': 'payment_method',
  'StaffName': 'staff_name', 'Staff': 'staff_name', 'Doctor': 'staff_name',
  'Duration': 'duration_minutes', 'Time': 'duration_minutes',
  'Discount': 'discount',
  'Tax': 'tax',
  'Note': 'notes', 'Notes': 'notes', 'Comment': 'notes', 'Memo': 'notes',
}

const SLIP_DB_COLUMNS = [
  { key: '', label: '（スキップ）' },
  { key: 'visit_date', label: '来院日 *' },
  { key: 'patient_name', label: '患者名 *' },
  { key: 'menu_name', label: '施術メニュー' },
  { key: 'total_price', label: '合計金額' },
  { key: 'base_price', label: '基本料金' },
  { key: 'option_names', label: 'オプション名' },
  { key: 'option_price', label: 'オプション料金' },
  { key: 'payment_method', label: '支払方法' },
  { key: 'staff_name', label: '担当スタッフ' },
  { key: 'duration_minutes', label: '施術時間（分）' },
  { key: 'discount', label: '値引き' },
  { key: 'tax', label: '消費税' },
  { key: 'notes', label: '備考' },
]

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done'

interface MatchedRow {
  rowIndex: number
  csvRow: string[]
  patientName: string
  visitDate: string | null
  totalPrice: number
  matchedPatient: PatientCandidate | null
  matchScore: number
  candidates: { patient: PatientCandidate; score: number }[]
  isDuplicate: boolean
  status: 'matched' | 'ambiguous' | 'unmatched'
}

export default function SlipImportPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<string[]>([])
  const [matchedRows, setMatchedRows] = useState<MatchedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState({ success: 0, skipped: 0, errors: 0, errorMessages: [] as string[] })
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('skip')
  const [unmatchedMode, setUnmatchedMode] = useState<'skip' | 'import_namonly'>('import_namonly')
  const [matchProcessing, setMatchProcessing] = useState(false)

  // Step 1: ファイルアップロード
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    readFileWithEncoding(file, (text) => {
      const clean = text.replace(/^\uFEFF/, '')
      const parsed = parseCSV(clean)
      if (parsed.length < 2) return

      const csvHeaders = parsed[0]
      const csvRows = parsed.slice(1).filter(r => r.some(c => c !== ''))
      setHeaders(csvHeaders)
      setRows(csvRows)

      const autoMap = csvHeaders.map(h => {
        const trimmed = h.trim()
        return SLIP_HEADER_MAP[trimmed] || ''
      })
      setMapping(autoMap)
      setStep('mapping')
    })
  }

  // Step 2: マッピング変更
  const handleMapping = (index: number, value: string) => {
    const updated = [...mapping]
    updated[index] = value
    setMapping(updated)
  }

  const hasRequired = mapping.includes('patient_name') && mapping.includes('visit_date')
  const hasPrice = mapping.includes('total_price')

  // Step 3: プレビュー（患者マッチング実行）
  const goToPreview = async () => {
    if (!hasRequired) {
      alert('「患者名」と「来院日」の列を必ず指定してください')
      return
    }
    setMatchProcessing(true)

    // 患者一覧取得
    const { data: patientList } = await supabase
      .from('cm_patients')
      .select('id, name, furigana')
      .eq('clinic_id', clinicId)

    const patients: PatientCandidate[] = patientList || []

    // 日付範囲を特定して既存スリップを取得（重複チェック用）
    const dateIdx = mapping.indexOf('visit_date')
    const nameIdx = mapping.indexOf('patient_name')
    const priceIdx = mapping.indexOf('total_price')

    const dates = rows.map(r => normalizeDate(r[dateIdx] || '')).filter(Boolean) as string[]
    const minDate = dates.length > 0 ? dates.reduce((a, b) => a < b ? a : b) : null
    const maxDate = dates.length > 0 ? dates.reduce((a, b) => a > b ? a : b) : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let existingSlips: any[] = []
    if (minDate && maxDate) {
      const { data } = await supabase
        .from('cm_slips')
        .select('patient_id, visit_date, total_price')
        .eq('clinic_id', clinicId)
        .gte('visit_date', minDate)
        .lte('visit_date', maxDate)
      existingSlips = data || []
    }

    // 既存スリップのキーセット（重複チェック用）
    const existingKeys = new Set(
      existingSlips.map(s => `${s.patient_id}_${s.visit_date?.split('T')[0]}`)
    )

    // 各行をマッチング
    const matched: MatchedRow[] = rows.map((row, i) => {
      const rawName = row[nameIdx] || ''
      const patientName = normalizeSpaces(rawName)
      const visitDate = normalizeDate(row[dateIdx] || '')
      const totalPrice = priceIdx >= 0 ? normalizePrice(row[priceIdx] || '') : 0

      // 患者マッチング
      const candidates = findAllMatches(patientName, patients, 5)
      const bestMatch = candidates.length > 0 ? candidates[0] : null

      let status: 'matched' | 'ambiguous' | 'unmatched' = 'unmatched'
      let matchedPatient: PatientCandidate | null = null
      let matchScore = 0

      if (bestMatch && bestMatch.score >= 90) {
        status = 'matched'
        matchedPatient = bestMatch.patient
        matchScore = bestMatch.score
      } else if (bestMatch && bestMatch.score >= 60) {
        status = 'ambiguous'
        matchedPatient = bestMatch.patient
        matchScore = bestMatch.score
      }

      // 重複チェック
      const isDuplicate = matchedPatient
        ? existingKeys.has(`${matchedPatient.id}_${visitDate}`)
        : false

      return {
        rowIndex: i,
        csvRow: row,
        patientName,
        visitDate,
        totalPrice,
        matchedPatient,
        matchScore,
        candidates,
        isDuplicate,
        status,
      }
    })

    setMatchedRows(matched)
    setMatchProcessing(false)
    setStep('preview')
  }

  // 手動で患者を選択
  const selectPatient = (rowIndex: number, patient: PatientCandidate | null) => {
    setMatchedRows(prev => prev.map(r => {
      if (r.rowIndex !== rowIndex) return r
      if (!patient) return { ...r, matchedPatient: null, matchScore: 0, status: 'unmatched' as const }
      return { ...r, matchedPatient: patient, matchScore: 100, status: 'matched' as const }
    }))
  }

  // 集計
  const stats = useMemo(() => {
    const matched = matchedRows.filter(r => r.status === 'matched').length
    const ambiguous = matchedRows.filter(r => r.status === 'ambiguous').length
    const unmatched = matchedRows.filter(r => r.status === 'unmatched').length
    const duplicates = matchedRows.filter(r => r.isDuplicate).length
    const noDate = matchedRows.filter(r => !r.visitDate).length
    return { matched, ambiguous, unmatched, duplicates, noDate }
  }, [matchedRows])

  // Step 4: インポート実行
  const handleImport = async () => {
    setStep('importing')
    setImporting(true)
    let success = 0
    let skipped = 0
    let errors = 0
    const errorMessages: string[] = []

    const importRows = matchedRows.filter(r => {
      // 日付なしは除外
      if (!r.visitDate) return false
      // 重複はモードに応じて
      if (r.isDuplicate && duplicateMode === 'skip') return false
      // 未マッチはモードに応じて
      if (r.status === 'unmatched' && unmatchedMode === 'skip') return false
      return true
    })

    setProgress({ current: 0, total: importRows.length })

    const batchSize = 50
    for (let i = 0; i < importRows.length; i += batchSize) {
      const batch = importRows.slice(i, i + batchSize)
      const records = batch.map(r => {
        const record: Record<string, unknown> = {
          clinic_id: clinicId,
          patient_id: r.matchedPatient?.id || null,
          patient_name: r.patientName,
          visit_date: r.visitDate,
        }

        // マッピングに従ってCSVデータをレコードに変換
        mapping.forEach((col, idx) => {
          if (!col || col === 'patient_name' || col === 'visit_date') return
          const val = r.csvRow[idx]?.trim()
          if (!val) return

          switch (col) {
            case 'total_price':
            case 'base_price':
            case 'option_price':
            case 'discount':
            case 'tax':
              record[col] = normalizePrice(val)
              break
            case 'payment_method':
              record[col] = normalizePaymentMethod(val)
              break
            case 'duration_minutes':
              record[col] = normalizeDuration(val)
              break
            case 'menu_name':
            case 'option_names':
            case 'staff_name':
            case 'notes':
              record[col] = normalizeSpaces(val)
              break
            default:
              record[col] = val
          }
        })

        // base_priceがなければtotal_priceをセット
        if (!record.base_price && record.total_price) {
          record.base_price = record.total_price
        }

        return record
      })

      // 重複更新の場合
      if (duplicateMode === 'update') {
        for (const rec of records) {
          if (!rec.patient_id) {
            const { error } = await supabase.from('cm_slips').insert(rec)
            if (error) { errors++; errorMessages.push(`${rec.patient_name} (${rec.visit_date}): ${error.message}`) }
            else success++
          } else {
            // 既存チェック
            const { data: existing } = await supabase
              .from('cm_slips')
              .select('id')
              .eq('clinic_id', clinicId)
              .eq('patient_id', rec.patient_id)
              .eq('visit_date', rec.visit_date as string)
              .limit(1)

            if (existing && existing.length > 0) {
              const { error } = await supabase.from('cm_slips').update(rec).eq('id', existing[0].id)
              if (error) { errors++; errorMessages.push(`${rec.patient_name} (${rec.visit_date}): ${error.message}`) }
              else success++
            } else {
              const { error } = await supabase.from('cm_slips').insert(rec)
              if (error) { errors++; errorMessages.push(`${rec.patient_name} (${rec.visit_date}): ${error.message}`) }
              else success++
            }
          }
        }
      } else {
        // 一括insert
        const { error, data } = await supabase.from('cm_slips').insert(records).select('id')
        if (error) {
          // 個別にリトライ
          for (const rec of records) {
            const { error: e2 } = await supabase.from('cm_slips').insert(rec)
            if (e2) { errors++; errorMessages.push(`${rec.patient_name} (${rec.visit_date}): ${e2.message}`) }
            else success++
          }
        } else {
          success += data?.length || records.length
        }
      }

      skipped = matchedRows.length - importRows.length
      setProgress({ current: Math.min(i + batchSize, importRows.length), total: importRows.length })
    }

    setResult({ success, skipped, errors, errorMessages: errorMessages.slice(0, 20) })
    setImporting(false)
    setStep('done')
  }

  const getVal = (row: string[], colKey: string) => {
    const idx = mapping.indexOf(colKey)
    if (idx === -1) return ''
    return row[idx] || ''
  }

  const stepLabels = ['CSVアップロード', '列の対応づけ', '患者マッチング・プレビュー', 'インポート完了']
  const stepKeys = ['upload', 'mapping', 'preview', 'done']
  const currentStepIdx = step === 'importing' ? 2 : stepKeys.indexOf(step)

  return (
    <AppShell>
      <Header title="来院履歴 インポート" />
      <div className="px-4 py-4 max-w-5xl mx-auto">
        {/* ステップ表示 */}
        <div className="flex items-center gap-1 mb-6 text-xs">
          {stepLabels.map((label, i) => {
            const isActive = i === currentStepIdx
            const isDone = i < currentStepIdx
            return (
              <div key={label} className="flex items-center gap-1">
                {i > 0 && <div className={`w-4 h-px ${isDone ? 'bg-green-400' : 'bg-gray-300'}`} />}
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${
                  isActive ? 'bg-[#14252A] text-white' : isDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  <span className="font-bold">{i + 1}</span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Step 1: アップロード */}
        {step === 'upload' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="font-bold text-gray-800 mb-4">来院履歴CSVをアップロード</h3>

            <div className="bg-blue-50 rounded-lg p-4 mb-4 text-sm text-blue-800">
              <p className="font-bold mb-1">対応フォーマット</p>
              <ul className="list-disc pl-4 space-y-0.5 text-xs">
                <li>CSV形式（.csv / .txt）</li>
                <li>1行目がヘッダー（列名）であること</li>
                <li>文字コード: UTF-8 または Shift-JIS（自動判定）</li>
                <li>CSS（顧客管理ソフト）のエクスポートCSVをそのまま使えます</li>
                <li>他の顧客管理システムのCSVにも柔軟に対応</li>
                <li><strong>必須列: 患者名、来院日</strong>（金額は任意）</li>
              </ul>
            </div>

            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-[#14252A] transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <p className="text-3xl mb-2">🧾</p>
              <p className="text-sm text-gray-600 mb-1">クリックしてCSVファイルを選択</p>
              <p className="text-xs text-gray-400">または、ファイルをここにドラッグ</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            </div>

            <div className="mt-4 bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 font-bold mb-2">CSVの例:</p>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="border px-2 py-1">来院日</th>
                      <th className="border px-2 py-1">患者名</th>
                      <th className="border px-2 py-1">施術メニュー</th>
                      <th className="border px-2 py-1">金額</th>
                      <th className="border px-2 py-1">担当者</th>
                      <th className="border px-2 py-1">支払方法</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border px-2 py-1">2024/01/15</td>
                      <td className="border px-2 py-1">山田 太郎</td>
                      <td className="border px-2 py-1">整体60分</td>
                      <td className="border px-2 py-1">8,000</td>
                      <td className="border px-2 py-1">大口</td>
                      <td className="border px-2 py-1">現金</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Link href="/sales/slips" className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">戻る</Link>
            </div>
          </div>
        )}

        {/* Step 2: マッピング */}
        {step === 'mapping' && (
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
            <h3 className="font-bold text-gray-800 mb-1">列の対応づけ</h3>
            <p className="text-xs text-gray-500 mb-4">
              CSVの各列がどの項目に対応するか確認・修正してください（{fileName} - {rows.length}件）
            </p>

            <div className="space-y-2">
              {headers.map((h, i) => {
                const matched = mapping[i]
                const matchedLabel = SLIP_DB_COLUMNS.find(c => c.key === matched)?.label
                return (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{h}</p>
                      <p className="text-xs text-gray-400 truncate">例: {rows[0]?.[i] || '(空)'}</p>
                    </div>
                    <span className="text-gray-400 text-sm">→</span>
                    <select
                      value={mapping[i]}
                      onChange={e => handleMapping(i, e.target.value)}
                      className={`flex-1 px-2 py-1.5 border rounded-lg text-sm ${
                        matched ? 'border-green-300 bg-green-50' : 'border-gray-300'
                      }`}
                    >
                      {SLIP_DB_COLUMNS.map(c => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                    {matched && (
                      <span className="text-green-500 text-xs whitespace-nowrap">{matchedLabel}</span>
                    )}
                  </div>
                )
              })}
            </div>

            {!hasRequired && (
              <div className="mt-3 bg-red-50 text-red-600 rounded-lg p-3 text-xs">
                「患者名」と「来院日」の列を必ず指定してください
              </div>
            )}
            {hasRequired && !hasPrice && (
              <div className="mt-3 bg-yellow-50 text-yellow-700 rounded-lg p-3 text-xs">
                「合計金額」の列が未指定です。金額なしでもインポートできますが、LTV計算に影響します。
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button onClick={() => setStep('upload')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">戻る</button>
              <button onClick={goToPreview} disabled={!hasRequired || matchProcessing}
                className="flex-1 py-2 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                style={{ background: '#14252A' }}>
                {matchProcessing ? '患者マッチング中...' : '次へ：プレビュー'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: プレビュー */}
        {step === 'preview' && (
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
            <h3 className="font-bold text-gray-800 mb-1">マッチング結果 & インポート確認</h3>
            <p className="text-xs text-gray-500 mb-4">{matchedRows.length}件のデータを確認してください</p>

            {/* 集計サマリー */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-700">{stats.matched}</p>
                <p className="text-xs text-green-600">マッチ済</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-yellow-700">{stats.ambiguous}</p>
                <p className="text-xs text-yellow-600">要確認</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-red-600">{stats.unmatched}</p>
                <p className="text-xs text-red-500">未マッチ</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-orange-600">{stats.duplicates}</p>
                <p className="text-xs text-orange-500">重複</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-gray-600">{stats.noDate}</p>
                <p className="text-xs text-gray-500">日付なし</p>
              </div>
            </div>

            {/* オプション設定 */}
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-bold text-gray-700 mb-2">重複データの処理:</p>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="radio" checked={duplicateMode === 'skip'} onChange={() => setDuplicateMode('skip')} />
                    スキップ
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="radio" checked={duplicateMode === 'update'} onChange={() => setDuplicateMode('update')} />
                    上書き更新
                  </label>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-bold text-gray-700 mb-2">未マッチ患者の処理:</p>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="radio" checked={unmatchedMode === 'import_namonly'} onChange={() => setUnmatchedMode('import_namonly')} />
                    名前のみで取込
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="radio" checked={unmatchedMode === 'skip'} onChange={() => setUnmatchedMode('skip')} />
                    スキップ
                  </label>
                </div>
              </div>
            </div>

            {/* データプレビュー */}
            <div className="max-h-[60vh] overflow-y-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left">状態</th>
                    <th className="px-2 py-2 text-left">CSV患者名</th>
                    <th className="px-2 py-2 text-left">マッチ先</th>
                    <th className="px-2 py-2 text-left">来院日</th>
                    <th className="px-2 py-2 text-right">金額</th>
                    <th className="px-2 py-2 text-left">メニュー</th>
                  </tr>
                </thead>
                <tbody>
                  {matchedRows.slice(0, 200).map((r) => (
                    <tr key={r.rowIndex} className={`border-t ${
                      !r.visitDate ? 'bg-gray-50 opacity-50' :
                      r.isDuplicate ? 'bg-orange-50' :
                      r.status === 'matched' ? 'bg-green-50/30' :
                      r.status === 'ambiguous' ? 'bg-yellow-50' :
                      'bg-red-50/30'
                    }`}>
                      <td className="px-2 py-1.5">
                        {!r.visitDate ? (
                          <span className="text-gray-400">日付なし</span>
                        ) : r.isDuplicate ? (
                          <span className="text-orange-600 font-medium">重複</span>
                        ) : r.status === 'matched' ? (
                          <span className="text-green-600">OK</span>
                        ) : r.status === 'ambiguous' ? (
                          <span className="text-yellow-600">要確認</span>
                        ) : (
                          <span className="text-red-500">未マッチ</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-medium">{r.patientName}</td>
                      <td className="px-2 py-1.5">
                        {r.status === 'matched' ? (
                          <span className="text-green-700">{r.matchedPatient?.name}</span>
                        ) : r.candidates.length > 0 ? (
                          <select
                            value={r.matchedPatient?.id || ''}
                            onChange={e => {
                              const p = r.candidates.find(c => c.patient.id === e.target.value)?.patient || null
                              selectPatient(r.rowIndex, p)
                            }}
                            className="px-1 py-0.5 border rounded text-xs w-full"
                          >
                            <option value="">-- 選択 --</option>
                            {r.candidates.map(c => (
                              <option key={c.patient.id} value={c.patient.id}>
                                {c.patient.name} ({c.score}%)
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400">候補なし</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{r.visitDate || '-'}</td>
                      <td className="px-2 py-1.5 text-right">{r.totalPrice > 0 ? `${r.totalPrice.toLocaleString()}円` : '-'}</td>
                      <td className="px-2 py-1.5 truncate max-w-[120px]">{getVal(r.csvRow, 'menu_name')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {matchedRows.length > 200 && (
                <p className="text-xs text-gray-400 text-center py-2">他 {matchedRows.length - 200}件...</p>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={() => setStep('mapping')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">戻る</button>
              <button onClick={handleImport}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-bold"
                style={{ background: '#14252A' }}>
                {matchedRows.length}件をインポート
              </button>
            </div>
          </div>
        )}

        {/* Step 3.5: インポート中 */}
        {step === 'importing' && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <p className="text-3xl mb-3">⏳</p>
            <h3 className="font-bold text-gray-800 text-lg mb-2">インポート中...</h3>
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
              <div
                className="h-3 rounded-full transition-all"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total * 100) : 0}%`, background: '#14252A' }}
              />
            </div>
            <p className="text-sm text-gray-500">{progress.current} / {progress.total}</p>
          </div>
        )}

        {/* Step 4: 完了 */}
        {step === 'done' && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <p className="text-4xl mb-3">{result.errors === 0 ? '✅' : '⚠️'}</p>
            <h3 className="font-bold text-gray-800 text-lg mb-2">インポート完了</h3>

            <div className="flex justify-center gap-6 mb-4">
              <div>
                <p className="text-2xl font-bold text-green-600">{result.success}</p>
                <p className="text-xs text-gray-500">成功</p>
              </div>
              {result.skipped > 0 && (
                <div>
                  <p className="text-2xl font-bold text-gray-400">{result.skipped}</p>
                  <p className="text-xs text-gray-500">スキップ</p>
                </div>
              )}
              {result.errors > 0 && (
                <div>
                  <p className="text-2xl font-bold text-red-500">{result.errors}</p>
                  <p className="text-xs text-gray-500">エラー</p>
                </div>
              )}
            </div>

            {result.errorMessages.length > 0 && (
              <div className="bg-red-50 rounded-lg p-3 mb-4 text-left">
                <p className="text-xs font-bold text-red-600 mb-1">エラー詳細:</p>
                {result.errorMessages.map((msg, i) => (
                  <p key={i} className="text-xs text-red-500">{msg}</p>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-center">
              <Link href="/sales/slips"
                className="px-6 py-2.5 text-white rounded-lg text-sm font-bold"
                style={{ background: '#14252A' }}>
                伝票一覧を見る
              </Link>
              <Link href="/sales/ltv"
                className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600">
                LTV分析を見る
              </Link>
              <button onClick={() => { setStep('upload'); setRows([]); setHeaders([]); setMapping([]); setMatchedRows([]) }}
                className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600">
                続けてインポート
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
