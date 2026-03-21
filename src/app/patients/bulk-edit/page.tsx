'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'
import { REFERRAL_SOURCES, PREFECTURES } from '@/lib/types'

type FieldKey = 'birth_date' | 'referral_source' | 'visit_motive' | 'occupation' | 'chief_complaint' | 'customer_category' | 'prefecture' | 'city' | 'phone'

interface FilterOption {
  key: FieldKey
  label: string
}

const filterOptions: FilterOption[] = [
  { key: 'birth_date', label: '生年月日' },
  { key: 'referral_source', label: '来院経路' },
  { key: 'visit_motive', label: '来院動機' },
  { key: 'occupation', label: '職業' },
  { key: 'chief_complaint', label: '主訴・症状' },
  { key: 'customer_category', label: '顧客カテゴリ' },
  { key: 'prefecture', label: '都道府県' },
  { key: 'city', label: '市区町村' },
  { key: 'phone', label: '電話番号' },
]

const OCCUPATIONS = ['会社員', '自営業', '主婦', 'パート・アルバイト', '学生', '公務員', '年金', '無職', 'その他']
const CATEGORIES = ['実費', '保険', '自賠責', '労災', '生活保護']
const MOTIVES = ['痛み改善', '健康維持', '美容', 'メンテナンス', '紹介で', '口コミを見て', '広告を見て', 'ネット検索', 'その他']

interface PatientRow {
  id: string
  name: string
  birth_date: string | null
  referral_source: string
  visit_motive: string
  occupation: string
  chief_complaint: string
  customer_category: string
  prefecture: string
  city: string
  phone: string
  ltv: number
  visit_count: number
}

export default function BulkEditPage() {
  const supabase = createClient()
  const clinicId = getClinicId()

  const [patients, setPatients] = useState<PatientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterField, setFilterField] = useState<FieldKey>('referral_source')
  const [showAll, setShowAll] = useState(false)
  const [edits, setEdits] = useState<Record<string, Partial<PatientRow>>>({})
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [bulkValue, setBulkValue] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const PAGE_SIZE = 1000
      let all: PatientRow[] = []
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const { data } = await supabase
          .from('cm_patients')
          .select('id, name, birth_date, referral_source, visit_motive, occupation, chief_complaint, customer_category, prefecture, city, phone, ltv, visit_count')
          .eq('clinic_id', clinicId)
          .order('name', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)

        if (!data) break
        all = all.concat(data as PatientRow[])
        hasMore = data.length === PAGE_SIZE
        offset += PAGE_SIZE
      }

      setPatients(all)
      setLoading(false)
    }
    load()
  }, [])

  const isEmpty = (v: string | null | undefined) => !v || v === '' || v === '未設定'

  // Filtered patients (missing the selected field)
  const filtered = useMemo(() => {
    if (showAll) return patients
    return patients.filter(p => isEmpty(p[filterField] as string | null))
  }, [patients, filterField, showAll])

  // Stats
  const stats = useMemo(() => {
    const result: Record<string, number> = {}
    filterOptions.forEach(f => {
      result[f.key] = patients.filter(p => isEmpty(p[f.key] as string | null)).length
    })
    return result
  }, [patients])

  const handleEdit = (id: string, field: FieldKey, value: string) => {
    setEdits(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value || null },
    }))
  }

  const getEditValue = (id: string, field: FieldKey, original: string | null): string => {
    return edits[id]?.[field] as string ?? original ?? ''
  }

  const handleSave = async () => {
    const entries = Object.entries(edits)
    if (entries.length === 0) return

    setSaving(true)
    setSavedCount(0)
    let count = 0

    for (const [id, changes] of entries) {
      // Clean up: remove null/undefined, convert '未設定' to null
      const cleanChanges: Record<string, string | null> = {}
      Object.entries(changes).forEach(([k, v]) => {
        cleanChanges[k] = (v === '' || v === '未設定') ? null : v as string
      })

      const { error } = await supabase.from('cm_patients').update(cleanChanges).eq('id', id)
      if (!error) {
        count++
        // Update local state
        setPatients(prev => prev.map(p => p.id === id ? { ...p, ...cleanChanges } as PatientRow : p))
      }
      setSavedCount(count)
    }

    setEdits({})
    setSaving(false)
    alert(`${count}件の患者情報を更新しました`)
  }

  const handleBulkApply = () => {
    if (!bulkValue || selectedIds.size === 0) return
    const newEdits = { ...edits }
    selectedIds.forEach(id => {
      newEdits[id] = { ...newEdits[id], [filterField]: bulkValue }
    })
    setEdits(newEdits)
    setSelectedIds(new Set())
    setBulkValue('')
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)))
    }
  }

  const renderInput = (patient: PatientRow, field: FieldKey) => {
    const value = getEditValue(patient.id, field, patient[field] as string | null)
    const isEdited = edits[patient.id]?.[field] !== undefined
    const baseClass = `w-full px-2 py-1 border rounded text-xs ${isEdited ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`

    if (field === 'referral_source') {
      return (
        <select value={value} onChange={e => handleEdit(patient.id, field, e.target.value)} className={baseClass}>
          <option value="">-- 選択 --</option>
          {REFERRAL_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )
    }
    if (field === 'prefecture') {
      return (
        <select value={value} onChange={e => handleEdit(patient.id, field, e.target.value)} className={baseClass}>
          <option value="">-- 選択 --</option>
          {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      )
    }
    if (field === 'occupation') {
      return (
        <div className="flex gap-1">
          <select value={OCCUPATIONS.includes(value) ? value : ''} onChange={e => handleEdit(patient.id, field, e.target.value)} className={`${baseClass} flex-1`}>
            <option value="">-- 選択 --</option>
            {OCCUPATIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {!OCCUPATIONS.includes(value) && value && (
            <input type="text" value={value} onChange={e => handleEdit(patient.id, field, e.target.value)} className={`${baseClass} w-20`} />
          )}
        </div>
      )
    }
    if (field === 'customer_category') {
      return (
        <select value={value} onChange={e => handleEdit(patient.id, field, e.target.value)} className={baseClass}>
          <option value="">-- 選択 --</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )
    }
    if (field === 'visit_motive') {
      return (
        <div className="flex gap-1">
          <select value={MOTIVES.includes(value) ? value : ''} onChange={e => handleEdit(patient.id, field, e.target.value)} className={`${baseClass} flex-1`}>
            <option value="">-- 選択 --</option>
            {MOTIVES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {!MOTIVES.includes(value) && value && (
            <input type="text" value={value} onChange={e => handleEdit(patient.id, field, e.target.value)} className={`${baseClass} w-20`} />
          )}
        </div>
      )
    }
    if (field === 'birth_date') {
      return <input type="date" value={value} onChange={e => handleEdit(patient.id, field, e.target.value)} className={baseClass} />
    }
    return <input type="text" value={value} onChange={e => handleEdit(patient.id, field, e.target.value)} className={baseClass} placeholder={field === 'phone' ? '090-xxxx-xxxx' : ''} />
  }

  const renderBulkInput = () => {
    if (filterField === 'referral_source') {
      return (
        <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs">
          <option value="">-- 選択 --</option>
          {REFERRAL_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )
    }
    if (filterField === 'prefecture') {
      return (
        <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs">
          <option value="">-- 選択 --</option>
          {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      )
    }
    if (filterField === 'customer_category') {
      return (
        <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs">
          <option value="">-- 選択 --</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )
    }
    if (filterField === 'occupation') {
      return (
        <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs">
          <option value="">-- 選択 --</option>
          {OCCUPATIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }
    if (filterField === 'visit_motive') {
      return (
        <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs">
          <option value="">-- 選択 --</option>
          {MOTIVES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      )
    }
    return <input type="text" value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-xs" placeholder="一括入力値" />
  }

  const editCount = Object.keys(edits).length

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">患者情報 一括編集</h2>
            <p className="text-xs text-gray-500 mt-1">未設定の項目を効率的に埋めていきます</p>
          </div>
          <Link href="/patients" className="text-xs text-blue-600 hover:text-blue-800">← 患者一覧に戻る</Link>
        </div>

        {/* 未設定サマリー */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">未設定件数</h3>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map(f => (
              <button
                key={f.key}
                onClick={() => { setFilterField(f.key); setShowAll(false); setSelectedIds(new Set()) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filterField === f.key && !showAll
                    ? 'bg-[#14252A] text-white'
                    : stats[f.key] > 0
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}
              >
                {f.label}
                <span className="ml-1 font-bold">{stats[f.key]}</span>
              </button>
            ))}
            <button
              onClick={() => { setShowAll(true); setSelectedIds(new Set()) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${showAll ? 'bg-[#14252A] text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              全患者 {patients.length}
            </button>
          </div>
        </div>

        {/* 一括適用バー */}
        {!showAll && filtered.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2">
            <button onClick={toggleSelectAll} className="px-2 py-1 bg-white border rounded text-xs">
              {selectedIds.size === filtered.length ? '全解除' : '全選択'}
            </button>
            <span className="text-xs text-gray-600">{selectedIds.size}件選択中 →</span>
            {renderBulkInput()}
            <button
              onClick={handleBulkApply}
              disabled={!bulkValue || selectedIds.size === 0}
              className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium disabled:opacity-40"
            >
              一括適用
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-green-600 font-bold text-lg mb-2">全て設定済み</p>
            <p className="text-xs text-gray-400">{filterOptions.find(f => f.key === filterField)?.label}は全患者に入力されています</p>
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-500 mb-2">{filtered.length}件{showAll ? '' : '（未設定のみ）'}</div>

            {/* モバイル: カード */}
            <div className="sm:hidden space-y-2">
              {filtered.map(p => (
                <div key={p.id} className="bg-white rounded-xl shadow-sm p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {!showAll && (
                      <input type="checkbox" checked={selectedIds.has(p.id)}
                        onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                        className="w-4 h-4" />
                    )}
                    <Link href={`/patients/${p.id}`} className="font-bold text-sm text-blue-600">{p.name}</Link>
                    <span className="text-[10px] text-gray-400 ml-auto">LTV {(p.ltv || 0).toLocaleString()}円</span>
                  </div>
                  <div className="space-y-1.5">
                    {(showAll ? filterOptions : [filterOptions.find(f => f.key === filterField)!]).map(f => (
                      <div key={f.key} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-16 shrink-0">{f.label}</span>
                        <div className="flex-1">{renderInput(p, f.key)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* PC: テーブル */}
            <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      {!showAll && <th className="px-2 py-2 w-8"><input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} /></th>}
                      <th className="text-left px-2 py-2 text-gray-500">患者名</th>
                      <th className="text-right px-2 py-2 text-gray-500 w-20">LTV</th>
                      {(showAll ? filterOptions : [filterOptions.find(f => f.key === filterField)!]).map(f => (
                        <th key={f.key} className="text-left px-2 py-2 text-gray-500 min-w-[140px]">{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        {!showAll && (
                          <td className="px-2 py-1.5">
                            <input type="checkbox" checked={selectedIds.has(p.id)}
                              onChange={() => setSelectedIds(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                            />
                          </td>
                        )}
                        <td className="px-2 py-1.5">
                          <Link href={`/patients/${p.id}`} className="text-blue-600 hover:underline font-medium">{p.name}</Link>
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-500">{(p.ltv || 0).toLocaleString()}</td>
                        {(showAll ? filterOptions : [filterOptions.find(f => f.key === filterField)!]).map(f => (
                          <td key={f.key} className="px-2 py-1.5">{renderInput(p, f.key)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* 保存ボタン（固定） */}
        {editCount > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-3 z-50">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <span className="text-sm text-gray-600">
                <strong className="text-blue-600">{editCount}件</strong>の変更があります
              </span>
              <div className="flex gap-2">
                <button onClick={() => setEdits({})} className="px-4 py-2 border border-gray-200 rounded-lg text-xs text-gray-500">
                  リセット
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2 bg-[#14252A] text-white rounded-lg text-xs font-bold disabled:opacity-50"
                >
                  {saving ? `保存中... (${savedCount}/${editCount})` : `${editCount}件を保存`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
