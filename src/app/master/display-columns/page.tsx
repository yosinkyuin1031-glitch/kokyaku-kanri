'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'

const STANDARD_COLUMNS = [
  { column_key: 'name', column_label: '氏名', sort_order: 1 },
  { column_key: 'gender', column_label: '性別', sort_order: 2 },
  { column_key: 'age', column_label: '年齢', sort_order: 3 },
  { column_key: 'birth_date', column_label: '生年月日', sort_order: 4 },
  { column_key: 'chief_complaint', column_label: '症状', sort_order: 5 },
  { column_key: 'referral_source', column_label: '来院経路', sort_order: 6 },
  { column_key: 'line_count', column_label: 'LINE回数', sort_order: 7 },
  { column_key: 'ltv', column_label: 'LTV', sort_order: 8 },
  { column_key: 'last_visit', column_label: '最終来院', sort_order: 9 },
  { column_key: 'days_since', column_label: '経過日数', sort_order: 10 },
]

export default function DisplayColumnsPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [columns, setColumns] = useState<{ id: string; column_key: string; column_label: string; is_visible: boolean; sort_order: number }[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('cm_display_columns').select('*').eq('clinic_id', clinicId).order('sort_order')
      const existing = data || []
      const existingKeys = new Set(existing.map(c => c.column_key))
      const missing = STANDARD_COLUMNS.filter(c => !existingKeys.has(c.column_key))
      if (missing.length > 0) {
        const toInsert = missing.map(c => ({ ...c, clinic_id: clinicId, is_visible: true }))
        await supabase.from('cm_display_columns').insert(toInsert)
        const { data: refreshed } = await supabase.from('cm_display_columns').select('*').eq('clinic_id', clinicId).order('sort_order')
        setColumns(refreshed || [])
      } else {
        setColumns(existing)
      }
    }
    load()
  }, [])

  const toggle = (idx: number) => {
    const updated = [...columns]
    updated[idx] = { ...updated[idx], is_visible: !updated[idx].is_visible }
    setColumns(updated)
  }

  const handleSave = async () => {
    setSaving(true)
    for (const col of columns) {
      await supabase.from('cm_display_columns').update({ is_visible: col.is_visible }).eq('id', col.id)
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h2 className="font-bold text-gray-800 border-b pb-2 mb-4">顧客一覧表示項目</h2>
      <p className="text-xs text-gray-400 mb-3">患者一覧画面で表示する項目を選択してください。</p>
      <div className="space-y-2">
        {columns.map((col, i) => (
          <div key={col.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
            <span className="text-sm font-medium">{col.column_label}</span>
            <button
              onClick={() => toggle(i)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                col.is_visible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {col.is_visible ? '表示' : '非表示'}
            </button>
          </div>
        ))}
      </div>
      <button onClick={handleSave} disabled={saving} className="w-full mt-4 text-white py-3 rounded-xl font-bold text-sm" style={{ background: '#14252A' }}>
        {saving ? '保存中...' : '保存する'}
      </button>
    </div>
  )
}
