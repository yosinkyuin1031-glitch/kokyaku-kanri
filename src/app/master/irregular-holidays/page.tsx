'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'

export default function IrregularHolidaysPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [holidays, setHolidays] = useState<{ id: string; holiday_date: string; reason: string }[]>([])
  const [newDate, setNewDate] = useState('')
  const [newReason, setNewReason] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('cm_irregular_holidays').select('*').eq('clinic_id', clinicId).order('holiday_date')
      setHolidays(data || [])
    }
    load()
  }, [])

  const handleAdd = async () => {
    if (!newDate) return
    const { data } = await supabase.from('cm_irregular_holidays').insert({ clinic_id: clinicId, holiday_date: newDate, reason: newReason }).select().single()
    if (data) {
      setHolidays([...holidays, data].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)))
      setNewDate('')
      setNewReason('')
    }
  }

  const handleDelete = async (id: string) => {
    await supabase.from('cm_irregular_holidays').delete().eq('id', id)
    setHolidays(holidays.filter(h => h.id !== id))
  }

  const inputClass = "px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A]"

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h2 className="font-bold text-gray-800 border-b pb-2 mb-4">不定休日設定</h2>

      <div className="flex gap-2 mb-4">
        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className={`flex-1 ${inputClass}`} />
        <input type="text" value={newReason} onChange={e => setNewReason(e.target.value)} className={`flex-1 ${inputClass}`} placeholder="理由（任意）" />
        <button onClick={handleAdd} className="text-white px-4 rounded-xl text-sm font-medium" style={{ background: '#14252A' }}>追加</button>
      </div>

      {holidays.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-4">不定休日はありません</p>
      ) : (
        <div className="space-y-2">
          {holidays.map(h => (
            <div key={h.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3">
              <div>
                <span className="font-medium text-sm">
                  {new Date(h.holiday_date + 'T00:00:00').toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })}
                </span>
                {h.reason && <span className="text-xs text-gray-400 ml-2">{h.reason}</span>}
              </div>
              <button onClick={() => handleDelete(h.id)} className="text-xs text-red-400">削除</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
