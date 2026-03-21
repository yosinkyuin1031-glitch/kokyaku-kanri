'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'
import { getClinicId } from '@/lib/clinic'

interface AdChannel {
  channel: string
  cost: number
  impressions: number
  clicks: number
  inquiries: number
  new_patients: number
  conversions: number
  revenue: number
}

export default function RoasPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [period, setPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [channelData, setChannelData] = useState<AdChannel[]>([])
  const [totalNewRevenue, setTotalNewRevenue] = useState(0)
  const [totalExistingRevenue, setTotalExistingRevenue] = useState(0)
  const [loading, setLoading] = useState(true)

  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      let queryStart: string
      let queryEnd: string

      if (period === 'day') {
        queryStart = new Date().toISOString().split('T')[0]
        queryEnd = queryStart
      } else if (period === 'month') {
        queryStart = selectedMonth + '-01'
        const d = new Date(queryStart)
        d.setMonth(d.getMonth() + 1)
        d.setDate(0)
        queryEnd = d.toISOString().split('T')[0]
      } else if (period === 'year') {
        queryStart = selectedYear + '-01-01'
        queryEnd = selectedYear + '-12-31'
      } else {
        queryStart = startDate
        queryEnd = endDate
      }

      // 広告費データ取得（月別のみ対応 - cm_ad_costsはmonthカラム）
      // 期間に含まれる全月の広告費を取得
      const startMonth = queryStart.slice(0, 7)
      const endMonth = queryEnd.slice(0, 7)
      const { data: adCosts } = await supabase
        .from('cm_ad_costs')
        .select('*')
        .eq('clinic_id', clinicId)
        .gte('month', startMonth)
        .lte('month', endMonth)

      // cm_slipsから売上取得
      const slips = await fetchAllSlips(supabase, 'patient_id, total_price', {
        gte: ['visit_date', queryStart],
        lte: ['visit_date', queryEnd],
      }) as { patient_id: string; total_price: number }[]

      if (!slips || slips.length === 0) {
        setChannelData([])
        setTotalNewRevenue(0)
        setTotalExistingRevenue(0)
        setLoading(false)
        return
      }

      // 患者の初回来院月を取得して新規/既存を判別
      const patientIds = [...new Set(slips.map(s => s.patient_id).filter(Boolean))]
      const allSlipsRaw = await fetchAllSlips(supabase, 'patient_id, visit_date') as { patient_id: string; visit_date: string }[]
      const allSlips = allSlipsRaw.filter(s => patientIds.includes(s.patient_id))

      const firstVisitDate: Record<string, string> = {}
      allSlips.forEach(s => {
        if (s.patient_id && (!firstVisitDate[s.patient_id] || s.visit_date < firstVisitDate[s.patient_id])) {
          firstVisitDate[s.patient_id] = s.visit_date
        }
      })

      // 患者の来院経路を取得
      const { data: patientsData } = await supabase
        .from('cm_patients')
        .select('id, referral_source')
        .eq('clinic_id', clinicId)
        .in('id', patientIds.length > 0 ? patientIds : ['__none__'])

      const patientSourceMap: Record<string, string> = {}
      patientsData?.forEach(p => { patientSourceMap[p.id] = p.referral_source || 'その他' })

      let newRev = 0
      let existRev = 0
      const channelRevenue: Record<string, number> = {}

      slips.forEach(s => {
        const amount = s.total_price || 0
        const pid = s.patient_id
        const isNew = pid && firstVisitDate[pid] && firstVisitDate[pid] >= queryStart && firstVisitDate[pid] <= queryEnd
        const source = pid ? (patientSourceMap[pid] || 'その他') : 'その他'

        if (isNew) {
          newRev += amount
          channelRevenue[source] = (channelRevenue[source] || 0) + amount
        } else {
          existRev += amount
        }
      })

      setTotalNewRevenue(newRev)
      setTotalExistingRevenue(existRev)

      // 広告チャネル別データを集約
      const channelMap: Record<string, AdChannel> = {}

      if (adCosts) {
        adCosts.forEach(ac => {
          if (!channelMap[ac.channel]) {
            channelMap[ac.channel] = {
              channel: ac.channel, cost: 0, impressions: 0, clicks: 0,
              inquiries: 0, new_patients: 0, conversions: 0, revenue: 0,
            }
          }
          const ch = channelMap[ac.channel]
          ch.cost += ac.cost || 0
          ch.impressions += ac.impressions || 0
          ch.clicks += ac.clicks || 0
          ch.inquiries += ac.inquiries || 0
          ch.new_patients += ac.new_patients || 0
          ch.conversions += ac.conversions || 0
        })
      }

      // 来院経路に基づく売上をマッピング
      Object.entries(channelRevenue).forEach(([source, rev]) => {
        const channelName = mapSourceToChannel(source)
        if (channelMap[channelName]) {
          channelMap[channelName].revenue += rev
        } else {
          channelMap[channelName] = {
            channel: channelName, cost: 0, impressions: 0, clicks: 0,
            inquiries: 0, new_patients: 0, conversions: 0, revenue: rev,
          }
        }
      })

      setChannelData(Object.values(channelMap).sort((a, b) => b.cost - a.cost))
      setLoading(false)
    }
    load()
  }, [period, selectedMonth, selectedYear, startDate, endDate])

  const totalCost = channelData.reduce((s, c) => s + c.cost, 0)
  const totalRevenue = totalNewRevenue + totalExistingRevenue
  const overallRoas = totalCost > 0 ? Math.round((totalRevenue / totalCost) * 100) : 0

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/roas' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">ROAS・広告分析</h2>

        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { key: 'day', label: '本日' },
            { key: 'month', label: '月別' },
            { key: 'year', label: '年間' },
            { key: 'custom', label: '期間指定' },
          ].map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                period === p.key ? 'border-[#14252A] bg-[#14252A] text-white' : 'border-gray-200 text-gray-500'
              }`}>{p.label}</button>
          ))}
        </div>

        {/* 期間選択UI */}
        <div className="mb-4">
          {period === 'month' && (
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
          )}
          {period === 'year' && (
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm">
              {years.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
          )}
          {period === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
              <span className="text-gray-400 text-sm">〜</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm" />
            </div>
          )}
        </div>

        {/* 全体ROAS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold" style={{ color: '#14252A' }}>{overallRoas}<span className="text-xs sm:text-sm">%</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">全体ROAS</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-red-600">{totalCost.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">広告費合計</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{totalNewRevenue.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">新規売上</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{totalRevenue.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">総売上</p>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : channelData.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-gray-400 mb-3">広告費データがありません</p>
            <Link href="/sales/ad-costs" className="text-blue-600 text-sm hover:underline">
              広告費入力ページで登録してください →
            </Link>
          </div>
        ) : (
          <>
          {/* モバイル: カード表示 */}
          <div className="sm:hidden space-y-3">
            {channelData.map(c => {
              const roas = c.cost > 0 ? Math.round((c.revenue / c.cost) * 100) : 0
              const cpa = c.new_patients > 0 ? Math.round(c.cost / c.new_patients) : 0
              const cpo = c.conversions > 0 ? Math.round(c.cost / c.conversions) : 0
              const responseRate = c.impressions > 0 ? (c.clicks / c.impressions * 100).toFixed(1) : '0'
              const cvRate = c.clicks > 0 ? (c.conversions / c.clicks * 100).toFixed(1) : '0'
              return (
                <div key={c.channel} className="bg-white rounded-xl shadow-sm p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-sm">{c.channel}</span>
                    <span className={`font-bold text-sm ${roas >= 100 ? 'text-green-600' : 'text-red-500'}`}>
                      ROAS {roas}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-gray-500">広告費</span><span>{c.cost.toLocaleString()}円</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">売上</span><span>{c.revenue.toLocaleString()}円</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">CPA</span><span>{cpa.toLocaleString()}円</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">CPO</span><span>{cpo.toLocaleString()}円</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">反応率</span><span>{responseRate}%</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">CV率</span><span>{cvRate}%</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">新規</span><span>{c.new_patients}人</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">CV数</span><span>{c.conversions}件</span></div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* PC: テーブル表示 */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2 text-xs text-gray-500">広告媒体</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">広告費</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">売上</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">ROAS</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">CPA</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">CPO</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">反応率</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">CV率</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">新規</th>
                </tr>
              </thead>
              <tbody>
                {channelData.map(c => {
                  const roas = c.cost > 0 ? Math.round((c.revenue / c.cost) * 100) : 0
                  const cpa = c.new_patients > 0 ? Math.round(c.cost / c.new_patients) : 0
                  const cpo = c.conversions > 0 ? Math.round(c.cost / c.conversions) : 0
                  const responseRate = c.impressions > 0 ? (c.clicks / c.impressions * 100).toFixed(1) : '-'
                  const cvRate = c.clicks > 0 ? (c.conversions / c.clicks * 100).toFixed(1) : '-'
                  return (
                    <tr key={c.channel} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{c.channel}</td>
                      <td className="px-3 py-2 text-right text-red-600">{c.cost.toLocaleString()}円</td>
                      <td className="px-3 py-2 text-right font-medium">{c.revenue.toLocaleString()}円</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-bold ${roas >= 100 ? 'text-green-600' : 'text-red-500'}`}>{roas}%</span>
                      </td>
                      <td className="px-3 py-2 text-right">{cpa > 0 ? cpa.toLocaleString() + '円' : '-'}</td>
                      <td className="px-3 py-2 text-right">{cpo > 0 ? cpo.toLocaleString() + '円' : '-'}</td>
                      <td className="px-3 py-2 text-right">{responseRate}%</td>
                      <td className="px-3 py-2 text-right">{cvRate}%</td>
                      <td className="px-3 py-2 text-right">{c.new_patients}人</td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-3 py-2">合計</td>
                  <td className="px-3 py-2 text-right text-red-600">{totalCost.toLocaleString()}円</td>
                  <td className="px-3 py-2 text-right">{totalRevenue.toLocaleString()}円</td>
                  <td className="px-3 py-2 text-right">
                    <span className={overallRoas >= 100 ? 'text-green-600' : 'text-red-500'}>{overallRoas}%</span>
                  </td>
                  <td className="px-3 py-2" colSpan={5}></td>
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

function mapSourceToChannel(source: string): string {
  const mapping: Record<string, string> = {
    'Google検索': 'SEO(自然検索)',
    'Googleマップ': 'Googleマップ(MEO)',
    'Instagram': 'Instagram広告',
    'YouTube': 'その他',
    'チラシ': 'チラシ',
    '紹介': '紹介',
    'LINE': 'LINE広告',
    '通りがかり': 'その他',
  }
  return mapping[source] || source
}
