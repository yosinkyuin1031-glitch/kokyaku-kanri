'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'

const DAYS = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日']

export default function RegularHolidaysPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [holidays, setHolidays] = useState<{ id: string; day_of_week: number; is_holiday: boolean; note: string }[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('cm_regular_holidays').select('*').eq('clinic_id', clinicId).order('day_of_week')
      if (data && data.length > 0) {
        setHolidays(data)
      } else {
        const items = DAYS.map((_, i) => ({ id: '', day_of_week: i, is_holiday: i === 0, note: DAYS[i] }))
        setHolidays(items)
      }
    }
    load()
  }, [])

  const toggle = (idx: number) => {
    const updated = [...holidays]
    updated[idx] = { ...updated[idx], is_holiday: !updated[idx].is_holiday }
    setHolidays(updated)
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('cm_regular_holidays').delete().eq('clinic_id', clinicId).gte('day_of_week', 0)
    await supabase.from('cm_regular_holidays').insert(holidays.map(h => ({
      clinic_id: clinicId, day_of_week: h.day_of_week, is_holiday: h.is_holiday, note: h.note
    })))
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h2 className="font-bold text-gray-800 border-b pb-2 mb-4">定休日設定</h2>
      <div className="space-y-2">
        {holidays.map((h, i) => (
          <div key={i} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
            <span className="font-medium text-sm">{DAYS[h.day_of_week]}</span>
            <button
              onClick={() => toggle(i)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                h.is_holiday ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
              }`}
            >
              {h.is_holiday ? '休み' : '営業'}
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
