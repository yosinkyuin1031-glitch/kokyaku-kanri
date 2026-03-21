'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'

// 全角ハイフン・ダッシュ類を半角に統一
function normalizePhone(val: string): string {
  return val
    .replace(/[\u2010-\u2015\u2212\uFF0D\uFF70₋]/g, '-')  // 各種全角ハイフン→半角
    .replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))  // 全角数字→半角
    .replace(/[^\d\-+() ]/g, '')  // 数字・ハイフン・+・括弧・スペース以外を除去
    .trim()
}

// CSVヘッダー → DBカラムのマッピング辞書
const HEADER_MAP: Record<string, string> = {
  // 日本語ヘッダー
  '氏名': 'name', '名前': 'name', '患者名': 'name', 'お名前': 'name', '姓名': 'name',
  'ふりがな': 'furigana', 'フリガナ': 'furigana', 'カナ': 'furigana', 'よみがな': 'furigana',
  '生年月日': 'birth_date', '誕生日': 'birth_date', '生年': 'birth_date',
  '性別': 'gender',
  '電話番号': 'phone', '電話': 'phone', 'TEL': 'phone', 'tel': 'phone', '携帯': 'phone', '携帯番号': 'phone',
  'メール': 'email', 'メールアドレス': 'email', 'email': 'email', 'EMAIL': 'email',
  '郵便番号': 'zipcode', '〒': 'zipcode',
  '都道府県': 'prefecture', '県': 'prefecture',
  '市区町村': 'city', '市町村': 'city',
  '住所': 'address', '番地': 'address', '住所1': 'address',
  '建物': 'building', 'マンション': 'building', '住所2': 'building', 'ビル名': 'building',
  '職業': 'occupation',
  '来院経路': 'referral_source', '紹介元': 'referral_source', '経路': 'referral_source', '来院きっかけ': 'referral_source',
  '来院動機': 'visit_motive', '動機': 'visit_motive',
  '顧客区分': 'customer_category', '区分': 'customer_category',
  '主訴': 'chief_complaint', '症状': 'chief_complaint', 'お悩み': 'chief_complaint',
  '既往歴': 'medical_history', '病歴': 'medical_history',
  '備考': 'notes', 'メモ': 'notes', 'ノート': 'notes', 'Comment': 'notes',
  'ステータス': 'status', '状態': 'status',
  '初回来院日': 'first_visit_date', '初診日': 'first_visit_date',
  '最終来院日': 'last_visit_date', '最終日': 'last_visit_date',
  '来院回数': 'visit_count',
  '担当者': 'doctor',
  // CSS（顧客管理ソフト）英語ヘッダー対応
  'Name': 'name',
  'NameReading': 'furigana',
  'PhoneNumber': 'phone', 'SparePhoneNumber': 'phone2',
  'Zipcode': 'zipcode',
  'Prefecture': 'prefecture',
  'City': 'css_city',         // CSSのCityは「市区町村＋番地」が入っているので専用処理
  'Building': 'css_building', // CSSのBuildingは「町名＋番地＋建物」が入っているので専用処理
  'Email': 'email',           // CSSのEmail列
  'MobileEmail': 'mobile_email', // CSSのMobileEmail列（Email優先、なければこちら）
  'IsDirectMail': 'is_direct_mail_text',
  'Sex': 'gender',
  'Birthday': 'birth_date',
  'PatientCategory': 'customer_category',
  'Job': 'occupation',
  'Motive': 'referral_source',
  'Symptom': 'chief_complaint',
  'Doctor': 'doctor',
  'FirstDay': 'first_visit_date',
  'LastDay': 'last_visit_date',
  'OperationNum': 'visit_count',
  'ReservationNum': 'reservation_count_text',
  'Ltv': 'ltv',
  'RegistrationDate': 'registration_date_text',
}

const DB_COLUMNS = [
  { key: '', label: '（スキップ）' },
  { key: 'name', label: '氏名' },
  { key: 'furigana', label: 'ふりがな' },
  { key: 'birth_date', label: '生年月日' },
  { key: 'gender', label: '性別' },
  { key: 'phone', label: '電話番号' },
  { key: 'email', label: 'メール' },
  { key: 'mobile_email', label: 'モバイルメール' },
  { key: 'zipcode', label: '郵便番号' },
  { key: 'prefecture', label: '都道府県' },
  { key: 'city', label: '市区町村' },
  { key: 'css_city', label: '市区町村（CSS形式）' },
  { key: 'address', label: '住所' },
  { key: 'building', label: '建物' },
  { key: 'css_building', label: '建物（CSS形式：町名＋番地）' },
  { key: 'occupation', label: '職業' },
  { key: 'referral_source', label: '来院経路' },
  { key: 'visit_motive', label: '来院動機' },
  { key: 'customer_category', label: '顧客区分' },
  { key: 'chief_complaint', label: '主訴' },
  { key: 'medical_history', label: '既往歴' },
  { key: 'notes', label: '備考' },
  { key: 'status', label: 'ステータス' },
  { key: 'doctor', label: '担当者' },
  { key: 'phone2', label: '予備電話番号' },
  { key: 'is_direct_mail_text', label: 'DM送付可否' },
  { key: 'first_visit_date', label: '初回来院日' },
  { key: 'last_visit_date', label: '最終来院日' },
  { key: 'visit_count', label: '来院回数' },
  { key: 'ltv', label: 'LTV' },
  { key: 'reservation_count_text', label: '予約回数（参考）' },
  { key: 'registration_date_text', label: '登録日（参考）' },
]

type Step = 'upload' | 'mapping' | 'preview' | 'done'

function parseCSV(text: string): string[][] {
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

function normalizeGender(val: string): '男性' | '女性' | 'その他' {
  const v = val.trim()
  if (['男', '男性', 'M', 'male', 'Male'].includes(v)) return '男性'
  if (['女', '女性', 'F', 'female', 'Female'].includes(v)) return '女性'
  return 'その他'
}

function normalizeStatus(val: string): 'active' | 'inactive' | 'completed' {
  const v = val.trim()
  if (['active', '通院中', '継続', '有効'].includes(v)) return 'active'
  if (['completed', '卒業', '完了', '終了'].includes(v)) return 'completed'
  if (['inactive', '休止', '中断', '無効'].includes(v)) return 'inactive'
  return 'active'
}

function normalizeBirthDate(val: string): string | null {
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
  return null
}

export default function ImportPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState({ success: 0, errors: 0, errorMessages: [] as string[] })
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('skip')

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    const tryParse = (text: string) => {
      const clean = text.replace(/^\uFEFF/, '')
      const parsed = parseCSV(clean)
      if (parsed.length < 2) return

      const csvHeaders = parsed[0]
      const csvRows = parsed.slice(1)
      setHeaders(csvHeaders)
      setRows(csvRows)

      const autoMap = csvHeaders.map(h => {
        const trimmed = h.trim()
        return HEADER_MAP[trimmed] || ''
      })
      setMapping(autoMap)
      setStep('mapping')
    }

    // まずUTF-8で読み、文字化けしていたらShift-JISで再読み込み
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      // 文字化け判定: ヘッダーに制御文字や不正文字が含まれていないか
      if (text.includes('\uFFFD') || /[\x00-\x08]/.test(text.substring(0, 200))) {
        const reader2 = new FileReader()
        reader2.onload = (ev2) => {
          tryParse(ev2.target?.result as string)
        }
        reader2.readAsText(file, 'Shift_JIS')
      } else {
        tryParse(text)
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  const handleMapping = (index: number, value: string) => {
    const updated = [...mapping]
    updated[index] = value
    setMapping(updated)
  }

  const goToPreview = () => {
    if (!mapping.includes('name')) {
      alert('「氏名」の列を指定してください')
      return
    }
    setStep('preview')
  }

  const buildRecord = (row: string[]) => {
    const record: Record<string, unknown> = {
      status: 'active',
      is_enabled: true,
      is_direct_mail: true,
      clinic_id: clinicId,
    }
    const extraNotes: string[] = []

    mapping.forEach((col, i) => {
      if (!col || !row[i]) return
      const val = row[i].trim()
      if (!val) return

      if (col === 'name') {
        // 全角スペースを半角に統一（例: 橋口　キリ → 橋口 キリ）
        record[col] = val.replace(/\u3000/g, ' ')
      } else if (col === 'furigana') {
        record[col] = val.replace(/\u3000/g, ' ')
      } else if (col === 'gender') {
        record[col] = normalizeGender(val)
      } else if (col === 'status') {
        record[col] = normalizeStatus(val)
      } else if (col === 'birth_date') {
        record[col] = normalizeBirthDate(val)
      } else if (col === 'phone') {
        record[col] = normalizePhone(val)
      } else if (col === 'phone2') {
        // 予備電話: メインが空なら使用
        const normalized = normalizePhone(val)
        if (normalized && !record['phone']) record['phone'] = normalized
      } else if (col === 'is_direct_mail_text') {
        record['is_direct_mail'] = val === '有効'
        record['is_enabled'] = val === '有効'
      } else if (col === 'css_city') {
        // CSSのCity列: 「大阪市住吉区」のような市区町村部分 → city に格納
        record['city'] = val
      } else if (col === 'css_building') {
        // CSSのBuilding列: 「苅田5-2-10-206」のような町名＋番地＋建物
        // → addressに格納（CSSにはaddress列がないため）
        record['address'] = val
      } else if (col === 'mobile_email') {
        // MobileEmail: Emailが空の場合のみ使用
        if (!record['email'] && val) record['email'] = val
      } else if (col === 'first_visit_date' || col === 'last_visit_date') {
        // 日付カラム: 正規化してDBに直接保存
        const normalized = normalizeBirthDate(val)
        if (normalized) record[col] = normalized
      } else if (col === 'visit_count') {
        const num = parseInt(val, 10)
        if (!isNaN(num)) record[col] = num
      } else if (col === 'ltv') {
        const num = parseInt(val, 10)
        if (!isNaN(num)) record[col] = num
      } else if (col === 'doctor') {
        // 担当者: notesに追記
        if (val) extraNotes.push(`担当: ${val}`)
      } else if (col === 'reservation_count_text' || col === 'registration_date_text') {
        // 参考情報: notesに追記
        if (col === 'reservation_count_text' && val !== '0') extraNotes.push(`予約回数: ${val}`)
        if (col === 'registration_date_text') extraNotes.push(`登録日: ${val}`)
      } else {
        record[col] = val
      }
    })

    // Email: CSVのEmail列を優先、なければMobileEmailを使用（上で処理済み）
    // extraNotesをnotesに結合
    if (extraNotes.length > 0) {
      const existing = (record['notes'] || '') as string
      record['notes'] = (existing ? existing + '\n' : '') + extraNotes.join('\n')
    }

    return record
  }

  const getPreviewValue = (row: string[], colKey: string) => {
    const idx = mapping.indexOf(colKey)
    if (idx === -1) return ''
    return row[idx] || ''
  }

  const handleImport = async () => {
    setImporting(true)
    let success = 0
    let errors = 0
    const errorMessages: string[] = []

    // バッチ処理（50件ずつ）
    const batchSize = 50
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const records = batch.map(buildRecord).filter(r => r.name)

      if (records.length === 0) continue

      if (duplicateMode === 'update') {
        // 1件ずつupsert（名前+電話番号で重複チェック）
        for (const rec of records) {
          const phoneForMatch = normalizePhone((rec.phone as string) || '')
          const { data: existing } = await supabase
            .from('cm_patients')
            .select('id')
            .eq('clinic_id', clinicId)
            .eq('name', rec.name as string)
            .eq('phone', phoneForMatch)
            .limit(1)

          if (existing && existing.length > 0) {
            const { error } = await supabase
              .from('cm_patients')
              .update(rec)
              .eq('id', existing[0].id)
            if (error) {
              errors++
              errorMessages.push(`${rec.name}: ${error.message}`)
            } else {
              success++
            }
          } else {
            const { error } = await supabase.from('cm_patients').insert(rec)
            if (error) {
              errors++
              errorMessages.push(`${rec.name}: ${error.message}`)
            } else {
              success++
            }
          }
        }
      } else {
        // skip: 重複は無視して新規のみinsert
        const { error, data } = await supabase.from('cm_patients').insert(records).select('id')
        if (error) {
          // 個別に試す
          for (const rec of records) {
            const { error: e2 } = await supabase.from('cm_patients').insert(rec)
            if (e2) {
              errors++
              errorMessages.push(`${rec.name}: ${e2.message}`)
            } else {
              success++
            }
          }
        } else {
          success += data?.length || records.length
        }
      }
    }

    setResult({ success, errors, errorMessages: errorMessages.slice(0, 10) })
    setImporting(false)
    setStep('done')
  }

  const previewRows = rows.slice(0, 5)

  return (
    <AppShell>
      <Header title="患者データ インポート" />
      <div className="px-4 py-4 max-w-4xl mx-auto">

        {/* ステップ表示 */}
        <div className="flex items-center gap-1 mb-6 text-xs">
          {['CSVアップロード', '列の対応づけ', 'プレビュー・実行', '完了'].map((label, i) => {
            const stepIdx = ['upload', 'mapping', 'preview', 'done'].indexOf(step)
            const isActive = i === stepIdx
            const isDone = i < stepIdx
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
            <h3 className="font-bold text-gray-800 mb-4">CSVファイルをアップロード</h3>

            <div className="bg-blue-50 rounded-lg p-4 mb-4 text-sm text-blue-800">
              <p className="font-bold mb-1">対応フォーマット</p>
              <ul className="list-disc pl-4 space-y-0.5 text-xs">
                <li>CSV形式（.csv）</li>
                <li>1行目がヘッダー（列名）であること</li>
                <li>文字コード: UTF-8 または Shift-JIS</li>
                <li>日本語のヘッダー名を自動で認識します</li>
                <li>他の顧客管理ソフトからエクスポートしたCSVをそのまま使えます</li>
              </ul>
            </div>

            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-[#14252A] transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <p className="text-3xl mb-2">📄</p>
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
                      <th className="border px-2 py-1">氏名</th>
                      <th className="border px-2 py-1">ふりがな</th>
                      <th className="border px-2 py-1">性別</th>
                      <th className="border px-2 py-1">電話番号</th>
                      <th className="border px-2 py-1">生年月日</th>
                      <th className="border px-2 py-1">住所</th>
                      <th className="border px-2 py-1">主訴</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border px-2 py-1">山田 太郎</td>
                      <td className="border px-2 py-1">やまだ たろう</td>
                      <td className="border px-2 py-1">男性</td>
                      <td className="border px-2 py-1">090-1234-5678</td>
                      <td className="border px-2 py-1">1985/03/15</td>
                      <td className="border px-2 py-1">横浜市神奈川区...</td>
                      <td className="border px-2 py-1">腰痛</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Link href="/patients" className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">
                戻る
              </Link>
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
                const matchedLabel = DB_COLUMNS.find(c => c.key === matched)?.label
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
                      {DB_COLUMNS.map(c => (
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

            {!mapping.includes('name') && (
              <div className="mt-3 bg-red-50 text-red-600 rounded-lg p-3 text-xs">
                「氏名」の列を必ず指定してください
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button onClick={() => setStep('upload')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">
                戻る
              </button>
              <button onClick={goToPreview}
                className="flex-1 py-2 text-white rounded-lg text-sm font-bold"
                style={{ background: '#14252A' }}>
                次へ：プレビュー
              </button>
            </div>
          </div>
        )}

        {/* Step 3: プレビュー */}
        {step === 'preview' && (
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
            <h3 className="font-bold text-gray-800 mb-1">インポート内容の確認</h3>
            <p className="text-xs text-gray-500 mb-4">
              {rows.length}件のデータをインポートします（先頭5件をプレビュー）
            </p>

            {/* 重複処理設定 */}
            <div className="bg-yellow-50 rounded-lg p-3 mb-4">
              <p className="text-xs font-bold text-gray-700 mb-2">同じ名前＋電話番号の患者が既にいる場合:</p>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={duplicateMode === 'skip'} onChange={() => setDuplicateMode('skip')} />
                  スキップ（新規のみ追加）
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={duplicateMode === 'update'} onChange={() => setDuplicateMode('update')} />
                  上書き更新
                </label>
              </div>
            </div>

            {/* モバイル: カードプレビュー */}
            <div className="sm:hidden space-y-2 mb-4">
              {previewRows.map((row, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-3">
                  <p className="font-bold text-sm">{getPreviewValue(row, 'name') || '(氏名なし)'}</p>
                  <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-gray-600">
                    {getPreviewValue(row, 'furigana') && <p>ふりがな: {getPreviewValue(row, 'furigana')}</p>}
                    {getPreviewValue(row, 'gender') && <p>性別: {getPreviewValue(row, 'gender')}</p>}
                    {getPreviewValue(row, 'phone') && <p>TEL: {getPreviewValue(row, 'phone')}</p>}
                    {getPreviewValue(row, 'birth_date') && <p>生年月日: {getPreviewValue(row, 'birth_date')}</p>}
                    {getPreviewValue(row, 'chief_complaint') && <p>主訴: {getPreviewValue(row, 'chief_complaint')}</p>}
                    {getPreviewValue(row, 'address') && <p>住所: {getPreviewValue(row, 'address')}</p>}
                  </div>
                </div>
              ))}
              {rows.length > 5 && (
                <p className="text-xs text-gray-400 text-center">他 {rows.length - 5}件...</p>
              )}
            </div>

            {/* PC: テーブルプレビュー */}
            <div className="hidden sm:block overflow-x-auto mb-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-2 py-1.5 text-left">#</th>
                    <th className="border px-2 py-1.5 text-left">氏名</th>
                    <th className="border px-2 py-1.5 text-left">ふりがな</th>
                    <th className="border px-2 py-1.5 text-left">性別</th>
                    <th className="border px-2 py-1.5 text-left">電話番号</th>
                    <th className="border px-2 py-1.5 text-left">生年月日</th>
                    <th className="border px-2 py-1.5 text-left">主訴</th>
                    <th className="border px-2 py-1.5 text-left">来院経路</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="border px-2 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="border px-2 py-1.5 font-medium">{getPreviewValue(row, 'name')}</td>
                      <td className="border px-2 py-1.5">{getPreviewValue(row, 'furigana')}</td>
                      <td className="border px-2 py-1.5">{getPreviewValue(row, 'gender')}</td>
                      <td className="border px-2 py-1.5">{getPreviewValue(row, 'phone')}</td>
                      <td className="border px-2 py-1.5">{getPreviewValue(row, 'birth_date')}</td>
                      <td className="border px-2 py-1.5">{getPreviewValue(row, 'chief_complaint')}</td>
                      <td className="border px-2 py-1.5">{getPreviewValue(row, 'referral_source')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 5 && (
                <p className="text-xs text-gray-400 mt-1">他 {rows.length - 5}件...</p>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep('mapping')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">
                戻る
              </button>
              <button onClick={handleImport} disabled={importing}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                style={{ background: '#14252A' }}>
                {importing ? `インポート中...` : `${rows.length}件をインポート`}
              </button>
            </div>
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
              <Link href="/patients"
                className="px-6 py-2.5 text-white rounded-lg text-sm font-bold"
                style={{ background: '#14252A' }}>
                患者一覧を見る
              </Link>
              <button onClick={() => { setStep('upload'); setRows([]); setHeaders([]); setMapping([]) }}
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
