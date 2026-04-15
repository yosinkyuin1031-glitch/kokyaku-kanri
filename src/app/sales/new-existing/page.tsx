'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'

interface SlipData {
  patient_id: string
  visit_date: string
  total_price: number
}

interface PeriodStats {
  label: string
  pureNewRevenue: number       // 純新規：その期間に初来院した患者の全売上
  existingRevenue: number      // 既存：その期間より前に来院歴のある患者の売上
  totalRevenue: number
  pureNewVisits: number        // 純新規の来院件数
  existingVisits: number
  pureNewPatients: number      // 純新規の患者数（ユニーク）
  pureNewAvgUnit: number       // 純新規の平均単価
  pureNewRatio: number         // 純新規比率
}

type PeriodKey = 'month' | 'year' | 'all' | 'custom'

export default function NewExistingPage() {
  const supabase = createClient()
  const [slips, setSlips] = useState<SlipData[]>([])
  const [firstVisitDate, setFirstVisitDate] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const data = await fetchAllSlips(supabase, 'patient_id, visit_date, total_price') as SlipData[]
      if (!data || data.length === 0) { setLoading(false); return }

      // 各患者の初回来院日
      const fvd: Record<string, string> = {}
      data.forEach(s => {
        if (!s.patient_id) return
        if (!fvd[s.patient_id] || s.visit_date < fvd[s.patient_id]) {
          fvd[s.patient_id] = s.visit_date
        }
      })

      setSlips(data)
      setFirstVisitDate(fvd)
      setLoading(false)
    }
    load()
  }, [])

  // 指定期間内のスリップを取得
  const getSlipsInRange = (start: string, end: string) => {
    return slips.filter(s => s.visit_date >= start && s.visit_date <= end)
  }

  // 指定期間の集計を行う（純新規 = その期間に初来院した患者の全売上）
  const computeStats = (periodSlips: SlipData[], periodStart: string, periodEnd: string, label: string): PeriodStats => {
    let pureNewRev = 0, existRev = 0, pureNewVisits = 0, existVisits = 0
    const newPatientSet = new Set<string>()

    periodSlips.forEach(s => {
      const amount = s.total_price || 0
      const fvd = s.patient_id ? firstVisitDate[s.patient_id] : null

      // 初回来院日が期間内 → 純新規
      if (fvd && fvd >= periodStart && fvd <= periodEnd) {
        pureNewRev += amount
        pureNewVisits++
        newPatientSet.add(s.patient_id)
      } else {
        existRev += amount
        existVisits++
      }
    })

    const total = pureNewRev + existRev
    return {
      label,
      pureNewRevenue: pureNewRev,
      existingRevenue: existRev,
      totalRevenue: total,
      pureNewVisits,
      existingVisits: existVisits,
      pureNewPatients: newPatientSet.size,
      pureNewAvgUnit: pureNewVisits > 0 ? Math.round(pureNewRev / pureNewVisits) : 0,
      pureNewRatio: total > 0 ? Math.round((pureNewRev / total) * 100) : 0,
    }
  }

  // 月単位の期間start/endを返す
  const monthRange = (m: string) => {
    const start = m + '-01'
    const d = new Date(start)
    d.setMonth(d.getMonth() + 1)
    d.setDate(0)
    return { start, end: d.toISOString().split('T')[0] }
  }

  // メイン集計
  const mainStats = useMemo((): PeriodStats => {
    if (slips.length === 0) return { label: '', pureNewRevenue: 0, existingRevenue: 0, totalRevenue: 0, pureNewVisits: 0, existingVisits: 0, pureNewPatients: 0, pureNewAvgUnit: 0, pureNewRatio: 0 }

    if (period === 'month') {
      const { start, end } = monthRange(selectedMonth)
      return computeStats(getSlipsInRange(start, end), start, end, selectedMonth)
    }
    if (period === 'year') {
      const start = selectedYear + '-01-01'
      const end = selectedYear + '-12-31'
      return computeStats(getSlipsInRange(start, end), start, end, selectedYear + '年')
    }
    if (period === 'custom') {
      return computeStats(getSlipsInRange(startDate, endDate), startDate, endDate, `${startDate}〜${endDate}`)
    }
    // all
    const sorted = [...slips].sort((a, b) => a.visit_date.localeCompare(b.visit_date))
    const allStart = sorted[0]?.visit_date || '2000-01-01'
    const allEnd = sorted[sorted.length - 1]?.visit_date || '2099-12-31'
    return computeStats(slips, allStart, allEnd, '全期間')
  }, [slips, firstVisitDate, period, selectedMonth, selectedYear, startDate, endDate])

  // 月別内訳（年間・全期間・期間指定で表示）
  const monthlyBreakdown = useMemo((): PeriodStats[] => {
    if (slips.length === 0) return []

    let rangeStart: string, rangeEnd: string
    if (period === 'year') {
      rangeStart = selectedYear + '-01-01'
      rangeEnd = selectedYear + '-12-31'
    } else if (period === 'custom') {
      rangeStart = startDate
      rangeEnd = endDate
    } else if (period === 'all') {
      const sorted = [...slips].sort((a, b) => a.visit_date.localeCompare(b.visit_date))
      rangeStart = sorted[0]?.visit_date || '2000-01-01'
      rangeEnd = sorted[sorted.length - 1]?.visit_date || '2099-12-31'
    } else {
      return [] // 月別は内訳不要
    }

    // 期間内の全月を列挙
    const periodSlips = getSlipsInRange(rangeStart, rangeEnd)
    const monthSet = new Set<string>()
    periodSlips.forEach(s => monthSet.add(s.visit_date.slice(0, 7)))
    const months = [...monthSet].sort()

    // 年間ビューでは「その年の初来院」で判定
    // 各月の集計は、月ごとの売上を出しつつ、新規判定は全期間ベース
    return months.map(m => {
      const { start, end } = monthRange(m)
      const mSlips = periodSlips.filter(s => s.visit_date >= start && s.visit_date <= end)

      let pureNewRev = 0, existRev = 0, pureNewVisits = 0, existVisits = 0
      const newPatientSet = new Set<string>()

      mSlips.forEach(s => {
        const amount = s.total_price || 0
        const fvd = s.patient_id ? firstVisitDate[s.patient_id] : null

        // 純新規判定: 初来院日が「親の期間」内
        if (fvd && fvd >= rangeStart && fvd <= rangeEnd) {
          pureNewRev += amount
          pureNewVisits++
          newPatientSet.add(s.patient_id)
        } else {
          existRev += amount
          existVisits++
        }
      })

      const total = pureNewRev + existRev
      return {
        label: m,
        pureNewRevenue: pureNewRev,
        existingRevenue: existRev,
        totalRevenue: total,
        pureNewVisits,
        existingVisits: existVisits,
        pureNewPatients: newPatientSet.size,
        pureNewAvgUnit: pureNewVisits > 0 ? Math.round(pureNewRev / pureNewVisits) : 0,
        pureNewRatio: total > 0 ? Math.round((pureNewRev / total) * 100) : 0,
      }
    })
  }, [slips, firstVisitDate, period, selectedMonth, selectedYear, startDate, endDate])

  // 構成比バー
  const Bar = ({ pureNew, existing, total }: { pureNew: number; existing: number; total: number }) => {
    if (total === 0) return null
    const ratio = Math.round((pureNew / total) * 100)
    return (
      <div className="flex h-full rounded overflow-hidden">
        <div className="bg-blue-500" style={{ width: `${ratio}%` }} />
        <div className="bg-green-500" style={{ width: `${100 - ratio}%` }} />
      </div>
    )
  }

  const s = mainStats

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/new-existing' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">新規売上 / 既存売上</h2>

        {/* 期間選択 */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {([
            { key: 'month' as PeriodKey, label: '月別' },
            { key: 'year' as PeriodKey, label: '年間' },
            { key: 'all' as PeriodKey, label: '全期間' },
            { key: 'custom' as PeriodKey, label: '期間指定' },
          ]).map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                period === p.key ? 'border-[#14252A] bg-[#14252A] text-white' : 'border-gray-200 text-gray-500'
              }`}>{p.label}</button>
          ))}
        </div>

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

        {/* サマリーカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{s.pureNewRevenue.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">純新規売上（{s.pureNewPatients}人）</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{s.existingRevenue.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">既存売上（{s.existingVisits}件）</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold" style={{ color: '#14252A' }}>{s.totalRevenue.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">総売上</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-orange-600">{s.pureNewRatio}<span className="text-xs sm:text-sm">%</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">純新規比率</p>
          </div>
        </div>

        {/* 詳細指標 */}
        {s.totalRevenue > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <div className="flex h-8 rounded-lg overflow-hidden mb-3">
              <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-bold"
                style={{ width: `${s.pureNewRatio}%` }}>
                {s.pureNewRatio > 10 && `純新規 ${s.pureNewRatio}%`}
              </div>
              <div className="bg-green-500 flex items-center justify-center text-white text-xs font-bold"
                style={{ width: `${100 - s.pureNewRatio}%` }}>
                {(100 - s.pureNewRatio) > 10 && `既存 ${100 - s.pureNewRatio}%`}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600">
              <div><span className="text-gray-400">純新規 来院数</span><br/><span className="font-bold text-blue-600">{s.pureNewVisits}件</span></div>
              <div><span className="text-gray-400">純新規 患者数</span><br/><span className="font-bold text-blue-600">{s.pureNewPatients}人</span></div>
              <div><span className="text-gray-400">純新規 平均単価</span><br/><span className="font-bold text-blue-600">{s.pureNewAvgUnit.toLocaleString()}円</span></div>
              <div><span className="text-gray-400">1人あたり売上</span><br/><span className="font-bold text-blue-600">{s.pureNewPatients > 0 ? Math.round(s.pureNewRevenue / s.pureNewPatients).toLocaleString() : 0}円</span></div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              ※ 純新規 = {period === 'year' ? 'その年' : period === 'month' ? 'その月' : '選択期間'}に初めて来院した患者の全売上（2回目以降も含む）
            </p>
          </div>
        )}

        {loading ? (
          <div className="animate-pulse space-y-3 py-4" role="status" aria-label="読み込み中"><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /></div>
        ) : monthlyBreakdown.length > 0 ? (
          <>
          {/* 月別内訳 - モバイル */}
          <div className="sm:hidden space-y-2">
            {monthlyBreakdown.map(d => (
              <div key={d.label} className="bg-white rounded-xl shadow-sm p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-sm">{d.label}</span>
                  <span className="font-bold text-sm">{d.totalRevenue.toLocaleString()}円</span>
                </div>
                <div className="h-3 rounded overflow-hidden mb-1">
                  <Bar pureNew={d.pureNewRevenue} existing={d.existingRevenue} total={d.totalRevenue} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span className="text-blue-600">純新規 {d.pureNewRevenue.toLocaleString()}円（{d.pureNewPatients}人/{d.pureNewVisits}件）</span>
                  <span className="text-green-600">既存 {d.existingRevenue.toLocaleString()}円</span>
                </div>
              </div>
            ))}
          </div>

          {/* 月別内訳 - PC */}
          <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2 text-xs text-gray-500">月</th>
                  <th className="text-right px-3 py-2 text-xs text-blue-600">純新規売上</th>
                  <th className="text-right px-3 py-2 text-xs text-blue-600">人数/件数</th>
                  <th className="text-right px-3 py-2 text-xs text-green-600">既存売上</th>
                  <th className="text-right px-3 py-2 text-xs text-green-600">件数</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">総売上</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">純新規比率</th>
                  <th className="px-3 py-2 text-xs text-gray-500 w-32">構成比</th>
                </tr>
              </thead>
              <tbody>
                {monthlyBreakdown.map(d => (
                  <tr key={d.label} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{d.label}</td>
                    <td className="px-3 py-2 text-right text-blue-600 font-medium">{d.pureNewRevenue.toLocaleString()}円</td>
                    <td className="px-3 py-2 text-right text-blue-600 text-xs">{d.pureNewPatients}人/{d.pureNewVisits}件</td>
                    <td className="px-3 py-2 text-right text-green-600">{d.existingRevenue.toLocaleString()}円</td>
                    <td className="px-3 py-2 text-right text-green-600 text-xs">{d.existingVisits}件</td>
                    <td className="px-3 py-2 text-right font-medium">{d.totalRevenue.toLocaleString()}円</td>
                    <td className="px-3 py-2 text-right">{d.pureNewRatio}%</td>
                    <td className="px-3 py-2">
                      <div className="h-3">
                        <Bar pureNew={d.pureNewRevenue} existing={d.existingRevenue} total={d.totalRevenue} />
                      </div>
                    </td>
                  </tr>
                ))}
                {/* 合計行 */}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-3 py-2">合計</td>
                  <td className="px-3 py-2 text-right text-blue-600">{s.pureNewRevenue.toLocaleString()}円</td>
                  <td className="px-3 py-2 text-right text-blue-600 text-xs">{s.pureNewPatients}人/{s.pureNewVisits}件</td>
                  <td className="px-3 py-2 text-right text-green-600">{s.existingRevenue.toLocaleString()}円</td>
                  <td className="px-3 py-2 text-right text-green-600 text-xs">{s.existingVisits}件</td>
                  <td className="px-3 py-2 text-right">{s.totalRevenue.toLocaleString()}円</td>
                  <td className="px-3 py-2 text-right">{s.pureNewRatio}%</td>
                  <td className="px-3 py-2">
                    <div className="h-3">
                      <Bar pureNew={s.pureNewRevenue} existing={s.existingRevenue} total={s.totalRevenue} />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>
          </>
        ) : period === 'month' && s.totalRevenue === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-gray-400">この月のデータがありません</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  )
}
