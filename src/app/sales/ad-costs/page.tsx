'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { getClinicId } from '@/lib/clinic'

interface AdCostRow {
  id?: string
  channel: string
  cost: number
  impressions: number
  clicks: number
  inquiries: number
  new_patients: number
  conversions: number
  notes: string
}

export default function AdCostsPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [channels, setChannels] = useState<string[]>([])
  const [rows, setRows] = useState<AdCostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadChannels = async () => {
      const { data } = await supabase.from('cm_ad_channels').select('name').eq('clinic_id', clinicId).eq('is_active', true).order('sort_order')
      setChannels(data?.map(c => c.name) || [])
    }
    loadChannels()
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('cm_ad_costs')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('month', selectedMonth)
        .order('channel')

      if (data && data.length > 0) {
        setRows(data.map(d => ({
          id: d.id,
          channel: d.channel,
          cost: d.cost || 0,
          impressions: d.impressions || 0,
          clicks: d.clicks || 0,
          inquiries: d.inquiries || 0,
          new_patients: d.new_patients || 0,
          conversions: d.conversions || 0,
          notes: d.notes || '',
        })))
      } else {
        // チャネルマスタから空の行を生成
        setRows(channels.map(ch => ({
          channel: ch, cost: 0, impressions: 0, clicks: 0,
          inquiries: 0, new_patients: 0, conversions: 0, notes: '',
        })))
      }
      setLoading(false)
    }
    if (channels.length > 0) load()
  }, [selectedMonth, channels])

  const updateRow = (index: number, key: keyof AdCostRow, value: string | number) => {
    const updated = [...rows]
    updated[index] = { ...updated[index], [key]: value }
    setRows(updated)
  }

  const handleSave = async () => {
    setSaving(true)
    // 既存データを削除して再挿入
    await supabase.from('cm_ad_costs').delete().eq('clinic_id', clinicId).eq('month', selectedMonth)

    const inserts = rows
      .filter(r => r.cost > 0 || r.impressions > 0 || r.clicks > 0 || r.new_patients > 0 || r.conversions > 0)
      .map(r => ({
        clinic_id: clinicId,
        month: selectedMonth,
        channel: r.channel,
        cost: r.cost,
        impressions: r.impressions,
        clicks: r.clicks,
        inquiries: r.inquiries,
        new_patients: r.new_patients,
        conversions: r.conversions,
        notes: r.notes,
      }))

    if (inserts.length > 0) {
      await supabase.from('cm_ad_costs').insert(inserts)
    }
    setSaving(false)
  }

  const totalCost = rows.reduce((s, r) => s + r.cost, 0)
  const inputClass = "w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#14252A]"

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/ad-costs' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >{tab.label}</Link>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h2 className="font-bold text-gray-800 text-lg">広告費入力</h2>
          <div className="flex items-center gap-2">
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 text-white rounded-lg text-sm font-bold disabled:opacity-50"
              style={{ background: '#14252A' }}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-3 mb-4 flex justify-between items-center">
          <span className="text-sm text-gray-700">広告費合計</span>
          <span className="font-bold text-lg text-red-600">{totalCost.toLocaleString()}円</span>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : (
          <>
          {/* モバイル: カード入力 */}
          <div className="sm:hidden space-y-3">
            {rows.map((r, i) => (
              <div key={r.channel} className="bg-white rounded-xl shadow-sm p-3">
                <p className="font-bold text-sm mb-2">{r.channel}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-500">広告費(円)</label>
                    <input type="number" value={r.cost || ''} onChange={e => updateRow(i, 'cost', parseInt(e.target.value) || 0)}
                      className={inputClass} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500">表示回数</label>
                    <input type="number" value={r.impressions || ''} onChange={e => updateRow(i, 'impressions', parseInt(e.target.value) || 0)}
                      className={inputClass} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500">クリック数</label>
                    <input type="number" value={r.clicks || ''} onChange={e => updateRow(i, 'clicks', parseInt(e.target.value) || 0)}
                      className={inputClass} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500">問合せ数</label>
                    <input type="number" value={r.inquiries || ''} onChange={e => updateRow(i, 'inquiries', parseInt(e.target.value) || 0)}
                      className={inputClass} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500">新規患者数</label>
                    <input type="number" value={r.new_patients || ''} onChange={e => updateRow(i, 'new_patients', parseInt(e.target.value) || 0)}
                      className={inputClass} placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500">CV数</label>
                    <input type="number" value={r.conversions || ''} onChange={e => updateRow(i, 'conversions', parseInt(e.target.value) || 0)}
                      className={inputClass} placeholder="0" />
                  </div>
                </div>
              </div>
            ))}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-3 text-white rounded-xl font-bold text-sm disabled:opacity-50"
              style={{ background: '#14252A' }}>
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>

          {/* PC: テーブル入力 */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2 text-xs text-gray-500 whitespace-nowrap">広告媒体</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-500 whitespace-nowrap">広告費(円)</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-500 whitespace-nowrap">表示回数</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-500 whitespace-nowrap">クリック</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-500 whitespace-nowrap">問合せ</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-500 whitespace-nowrap">新規患者</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-500 whitespace-nowrap">CV数</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.channel} className="border-b">
                    <td className="px-3 py-1.5 font-medium whitespace-nowrap">{r.channel}</td>
                    <td className="px-1 py-1">
                      <input type="number" value={r.cost || ''} onChange={e => updateRow(i, 'cost', parseInt(e.target.value) || 0)}
                        className={inputClass} placeholder="0" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" value={r.impressions || ''} onChange={e => updateRow(i, 'impressions', parseInt(e.target.value) || 0)}
                        className={inputClass} placeholder="0" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" value={r.clicks || ''} onChange={e => updateRow(i, 'clicks', parseInt(e.target.value) || 0)}
                        className={inputClass} placeholder="0" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" value={r.inquiries || ''} onChange={e => updateRow(i, 'inquiries', parseInt(e.target.value) || 0)}
                        className={inputClass} placeholder="0" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" value={r.new_patients || ''} onChange={e => updateRow(i, 'new_patients', parseInt(e.target.value) || 0)}
                        className={inputClass} placeholder="0" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" value={r.conversions || ''} onChange={e => updateRow(i, 'conversions', parseInt(e.target.value) || 0)}
                        className={inputClass} placeholder="0" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
