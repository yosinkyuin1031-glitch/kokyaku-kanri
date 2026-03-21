'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'

export default function FacilityPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [form, setForm] = useState({
    facility_name: '', address: '', phone: '', email: '', owner_name: '', business_hours: ''
  })
  const [id, setId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('cm_facility_info').select('*').eq('clinic_id', clinicId).limit(1).single()
      if (data) { setForm(data); setId(data.id) }
    }
    load()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    if (id) {
      await supabase.from('cm_facility_info').update(form).eq('id', id)
    } else {
      const { data } = await supabase.from('cm_facility_info').insert({ ...form, clinic_id: clinicId }).select().single()
      if (data) setId(data.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputClass = "w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A]"

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
      <h2 className="font-bold text-gray-800 border-b pb-2">施設基本情報</h2>
      <div>
        <label className="block text-xs text-gray-600 mb-1">施設名</label>
        <input value={form.facility_name} onChange={e => setForm({...form, facility_name: e.target.value})} className={inputClass} placeholder="例：○○整骨院" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">住所</label>
        <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className={inputClass} placeholder="大阪市住吉区長居..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">電話番号</label>
          <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">メール</label>
          <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className={inputClass} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">代表者名</label>
        <input value={form.owner_name} onChange={e => setForm({...form, owner_name: e.target.value})} className={inputClass} placeholder="大口雄平" />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-1">営業時間</label>
        <input value={form.business_hours} onChange={e => setForm({...form, business_hours: e.target.value})} className={inputClass} placeholder="9:00〜20:00" />
      </div>
      <button onClick={handleSave} disabled={saving} className="w-full text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50" style={{ background: '#14252A' }}>
        {saving ? '保存中...' : saved ? '保存しました' : '保存する'}
      </button>
    </div>
  )
}
