'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'
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

interface AutoMetrics {
  actualNewPatients: number
  actualInquiries: number
  actualRevenue: number
}

export default function AdCostsPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [motives, setMotives] = useState<string[]>([])
  const [rows, setRows] = useState<AdCostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [autoMetrics, setAutoMetrics] = useState<Record<string, AutoMetrics>>({})

  // 来店動機マスターから媒体一覧を取得
  useEffect(() => {
    const loadMotives = async () => {
      const { data } = await supabase
        .from('cm_visit_motives')
        .select('name')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .order('sort_order')
      setMotives(data?.map(m => m.name) || [])
    }
    loadMotives()
  }, [])

  // 広告費データと自動計測データを読み込み
  useEffect(() => {
    const load = async () => {
      if (motives.length === 0) return
      setLoading(true)

      // 広告費データ取得
      const { data } = await supabase
        .from('cm_ad_costs')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('month', selectedMonth)
        .order('channel')

      if (data && data.length > 0) {
        // 既存データ + マスターにあるが未登録の媒体を追加
        const existingChannels = new Set(data.map(d => d.channel))
        const existingRows = data.map(d => ({
          id: d.id,
          channel: d.channel,
          cost: d.cost || 0,
          impressions: d.impressions || 0,
          clicks: d.clicks || 0,
          inquiries: d.inquiries || 0,
          new_patients: d.new_patients || 0,
          conversions: d.conversions || 0,
          notes: d.notes || '',
        }))
        const newRows = motives
          .filter(m => !existingChannels.has(m))
          .map(ch => ({
            channel: ch, cost: 0, impressions: 0, clicks: 0,
            inquiries: 0, new_patients: 0, conversions: 0, notes: '',
          }))
        setRows([...existingRows, ...newRows])
      } else {
        setRows(motives.map(ch => ({
          channel: ch, cost: 0, impressions: 0, clicks: 0,
          inquiries: 0, new_patients: 0, conversions: 0, notes: '',
        })))
      }

      // 自動計測: 該当月の新規患者数・売上を来院動機別に集計
      await loadAutoMetrics()
      setLoading(false)
    }
    load()
  }, [selectedMonth, motives])

  const loadAutoMetrics = async () => {
    const monthStart = selectedMonth + '-01'
    const d = new Date(monthStart)
    d.setMonth(d.getMonth() + 1)
    d.setDate(0)
    const monthEnd = d.toISOString().split('T')[0]

    // 該当月の伝票を取得
    const slips = await fetchAllSlips(supabase, 'patient_id, total_price, visit_date', {
      gte: ['visit_date', monthStart],
      lte: ['visit_date', monthEnd],
    }) as { patient_id: string; total_price: number; visit_date: string }[]

    if (!slips || slips.length === 0) {
      setAutoMetrics({})
      return
    }

    // 全伝票から各患者の初回来院日を算出
    const allSlipsRaw = await fetchAllSlips(supabase, 'patient_id, visit_date') as { patient_id: string; visit_date: string }[]
    const firstVisitMap: Record<string, string> = {}
    allSlipsRaw.forEach(s => {
      if (s.patient_id && (!firstVisitMap[s.patient_id] || s.visit_date < firstVisitMap[s.patient_id])) {
        firstVisitMap[s.patient_id] = s.visit_date
      }
    })

    // 該当月の患者IDリスト
    const patientIds = [...new Set(slips.map(s => s.patient_id).filter(Boolean))]

    // 患者の来院動機を取得
    const PAGE_SIZE = 500
    let allPatients: { id: string; referral_source: string | null }[] = []
    let offset = 0
    while (true) {
      const { data: pData } = await supabase
        .from('cm_patients')
        .select('id, referral_source')
        .eq('clinic_id', clinicId)
        .in('id', patientIds.length > 0 ? patientIds.slice(offset, offset + PAGE_SIZE) : ['__none__'])
      if (!pData || pData.length === 0) break
      allPatients = allPatients.concat(pData)
      offset += PAGE_SIZE
      if (offset >= patientIds.length) break
    }

    const patientSourceMap: Record<string, string> = {}
    allPatients.forEach(p => { patientSourceMap[p.id] = p.referral_source || '不明' })

    // 媒体別に集計
    const metrics: Record<string, AutoMetrics> = {}

    // 新規患者カウント（該当月に初来院）
    patientIds.forEach(pid => {
      const source = patientSourceMap[pid] || '不明'
      if (!metrics[source]) metrics[source] = { actualNewPatients: 0, actualInquiries: 0, actualRevenue: 0 }
      if (firstVisitMap[pid] && firstVisitMap[pid] >= monthStart && firstVisitMap[pid] <= monthEnd) {
        metrics[source].actualNewPatients++
      }
    })

    // 売上集計（新規患者分）
    slips.forEach(s => {
      const pid = s.patient_id
      const source = pid ? (patientSourceMap[pid] || '不明') : '不明'
      if (!metrics[source]) metrics[source] = { actualNewPatients: 0, actualInquiries: 0, actualRevenue: 0 }
      if (pid && firstVisitMap[pid] && firstVisitMap[pid] >= monthStart && firstVisitMap[pid] <= monthEnd) {
        metrics[source].actualRevenue += s.total_price || 0
      }
    })

    setAutoMetrics(metrics)
  }

  const updateRow = (index: number, key: keyof AdCostRow, value: string | number) => {
    const updated = [...rows]
    updated[index] = { ...updated[index], [key]: value }
    setRows(updated)
  }

  const handleSave = async () => {
    setSaving(true)
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
  const totalAutoNew = Object.values(autoMetrics).reduce((s, m) => s + m.actualNewPatients, 0)
  const totalAutoRevenue = Object.values(autoMetrics).reduce((s, m) => s + m.actualRevenue, 0)
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

        {/* サマリー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-3 text-center">
            <p className="text-lg font-bold text-red-600">{totalCost.toLocaleString()}<span className="text-xs">円</span></p>
            <p className="text-[10px] text-gray-500">広告費合計</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-3 text-center">
            <p className="text-lg font-bold text-blue-600">{totalAutoNew}<span className="text-xs">人</span></p>
            <p className="text-[10px] text-gray-500">新規患者(自動計測)</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-3 text-center">
            <p className="text-lg font-bold text-green-600">{totalAutoRevenue.toLocaleString()}<span className="text-xs">円</span></p>
            <p className="text-[10px] text-gray-500">新規売上(自動計測)</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-3 text-center">
            <p className="text-lg font-bold" style={{ color: '#14252A' }}>
              {totalCost > 0 ? Math.round((totalAutoRevenue / totalCost) * 100) : 0}<span className="text-xs">%</span>
            </p>
            <p className="text-[10px] text-gray-500">ROAS(自動)</p>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 mb-3">※ 媒体名はマスター管理 → 来店動機から取得。新規患者数・売上は来院動機に基づき自動集計されます。</p>

        {loading ? (
          <div className="animate-pulse space-y-3 py-4" role="status" aria-label="読み込み中"><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /></div>
        ) : (
          <>
          {/* モバイル: カード入力 */}
          <div className="sm:hidden space-y-3">
            {rows.map((r, i) => {
              const am = autoMetrics[r.channel] || { actualNewPatients: 0, actualInquiries: 0, actualRevenue: 0 }
              const responseRate = r.impressions > 0 ? (r.clicks / r.impressions * 100).toFixed(1) : '-'
              const cvRate = r.clicks > 0 ? (am.actualNewPatients / r.clicks * 100).toFixed(1) : '-'
              const cpa = am.actualNewPatients > 0 ? Math.round(r.cost / am.actualNewPatients) : 0
              return (
                <div key={r.channel} className="bg-white rounded-xl shadow-sm p-3">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-bold text-sm">{r.channel}</p>
                    {am.actualNewPatients > 0 && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{am.actualNewPatients}人来院</span>
                    )}
                  </div>
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
                      <label className="block text-[10px] text-gray-500">クリック/枚数</label>
                      <input type="number" value={r.clicks || ''} onChange={e => updateRow(i, 'clicks', parseInt(e.target.value) || 0)}
                        className={inputClass} placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500">問合せ数</label>
                      <input type="number" value={r.inquiries || ''} onChange={e => updateRow(i, 'inquiries', parseInt(e.target.value) || 0)}
                        className={inputClass} placeholder="0" />
                    </div>
                  </div>
                  {/* 自動計測エリア */}
                  <div className="mt-2 pt-2 border-t border-dashed grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">新規患者</span><span className="font-medium text-blue-600">{am.actualNewPatients}人</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">新規売上</span><span className="font-medium text-green-600">{am.actualRevenue.toLocaleString()}円</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">反応率</span><span className="font-medium">{responseRate}{responseRate !== '-' ? '%' : ''}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">CV率</span><span className="font-medium">{cvRate}{cvRate !== '-' ? '%' : ''}</span></div>
                    {cpa > 0 && <div className="flex justify-between"><span className="text-gray-400">CPA</span><span className="font-medium text-red-500">{cpa.toLocaleString()}円</span></div>}
                  </div>
                </div>
              )
            })}
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
                  <th className="text-right px-2 py-2 text-xs text-gray-500 whitespace-nowrap">クリック/枚数</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-500 whitespace-nowrap">問合せ</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-400 whitespace-nowrap bg-blue-50">新規患者</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-400 whitespace-nowrap bg-blue-50">新規売上</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-400 whitespace-nowrap bg-green-50">反応率</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-400 whitespace-nowrap bg-green-50">CV率</th>
                  <th className="text-right px-2 py-2 text-xs text-gray-400 whitespace-nowrap bg-green-50">CPA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const am = autoMetrics[r.channel] || { actualNewPatients: 0, actualInquiries: 0, actualRevenue: 0 }
                  const responseRate = r.impressions > 0 ? (r.clicks / r.impressions * 100).toFixed(1) : '-'
                  const cvRate = r.clicks > 0 ? (am.actualNewPatients / r.clicks * 100).toFixed(1) : '-'
                  const cpa = am.actualNewPatients > 0 ? Math.round(r.cost / am.actualNewPatients) : 0
                  return (
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
                      <td className="px-2 py-1.5 text-right bg-blue-50 font-medium text-blue-600">{am.actualNewPatients}人</td>
                      <td className="px-2 py-1.5 text-right bg-blue-50 text-xs">{am.actualRevenue.toLocaleString()}円</td>
                      <td className="px-2 py-1.5 text-right bg-green-50 text-xs">{responseRate}{responseRate !== '-' ? '%' : ''}</td>
                      <td className="px-2 py-1.5 text-right bg-green-50 text-xs font-medium">{cvRate}{cvRate !== '-' ? '%' : ''}</td>
                      <td className="px-2 py-1.5 text-right bg-green-50 text-xs">{cpa > 0 ? cpa.toLocaleString() + '円' : '-'}</td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 font-bold text-xs">
                  <td className="px-3 py-2">合計</td>
                  <td className="px-2 py-2 text-right text-red-600">{totalCost.toLocaleString()}円</td>
                  <td className="px-2 py-2 text-right">{rows.reduce((s, r) => s + r.impressions, 0).toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{rows.reduce((s, r) => s + r.clicks, 0).toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{rows.reduce((s, r) => s + r.inquiries, 0).toLocaleString()}</td>
                  <td className="px-2 py-2 text-right bg-blue-50 text-blue-600">{totalAutoNew}人</td>
                  <td className="px-2 py-2 text-right bg-blue-50">{totalAutoRevenue.toLocaleString()}円</td>
                  <td className="px-2 py-2 text-right bg-green-50" colSpan={3}>
                    ROAS: <span className={totalCost > 0 && totalAutoRevenue / totalCost >= 1 ? 'text-green-600' : 'text-red-500'}>
                      {totalCost > 0 ? Math.round((totalAutoRevenue / totalCost) * 100) : 0}%
                    </span>
                  </td>
                </tr>
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
