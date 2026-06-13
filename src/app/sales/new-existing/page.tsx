'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'

interface SlipData {
  patient_id: string
  patient_name: string
  visit_date: string
  total_price: number
}

interface PatientRow {
  patient_id: string
  patient_name: string
  isNew: boolean
  visits: number
  revenue: number
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
  const [openMonth, setOpenMonth] = useState<string | null>(null)

  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const data = await fetchAllSlips(supabase, 'patient_id, patient_name, visit_date, total_price') as SlipData[]
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

  // モーダル用：選択月の患者別集計（新規/既存判定は親期間ベース）
  const monthPatientRows = useMemo((): { rows: PatientRow[]; total: number; avg: number; newCount: number; existingCount: number } => {
    if (!openMonth) return { rows: [], total: 0, avg: 0, newCount: 0, existingCount: 0 }

    // 親期間の決定
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
      const r = monthRange(openMonth)
      rangeStart = r.start
      rangeEnd = r.end
    }

    const { start, end } = monthRange(openMonth)
    const monthSlips = slips.filter(s => s.visit_date >= start && s.visit_date <= end)

    const map = new Map<string, PatientRow>()
    monthSlips.forEach(s => {
      const pid = s.patient_id || '__no_id__'
      const fvd = s.patient_id ? firstVisitDate[s.patient_id] : null
      const isNew = !!(fvd && fvd >= rangeStart && fvd <= rangeEnd)
      const existing = map.get(pid)
      if (existing) {
        existing.visits += 1
        existing.revenue += s.total_price || 0
      } else {
        map.set(pid, {
          patient_id: pid,
          patient_name: s.patient_name || '(名前なし)',
          isNew,
          visits: 1,
          revenue: s.total_price || 0,
        })
      }
    })

    const rows = [...map.values()].sort((a, b) => b.revenue - a.revenue)
    const total = rows.reduce((sum, r) => sum + r.revenue, 0)
    const avg = rows.length > 0 ? Math.round(total / rows.length) : 0
    const newCount = rows.filter(r => r.isNew).length
    const existingCount = rows.length - newCount

    return { rows, total, avg, newCount, existingCount }
  }, [openMonth, slips, firstVisitDate, period, selectedYear, startDate, endDate])

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
              <button key={d.label} onClick={() => setOpenMonth(d.label)}
                className="w-full text-left bg-white rounded-xl shadow-sm p-3 active:scale-[0.99] transition-transform">
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
              </button>
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
                  <tr key={d.label} onClick={() => setOpenMonth(d.label)} className="border-b hover:bg-gray-50 cursor-pointer">
                    <td className="px-3 py-2 font-medium text-blue-600 underline-offset-2 hover:underline">{d.label}</td>
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

      {/* 患者別モーダル */}
      {openMonth && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setOpenMonth(null)}>
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-4 py-3 bg-[#14252A] text-white">
              <h3 className="font-bold text-sm">{openMonth} の患者別売上（{monthPatientRows.rows.length}人）</h3>
              <button onClick={() => setOpenMonth(null)} className="text-white text-2xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 border-b">
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-base font-bold" style={{ color: '#14252A' }}>{monthPatientRows.total.toLocaleString()}<span className="text-xs">円</span></p>
                <p className="text-[10px] text-gray-500">売上合計</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-base font-bold text-blue-600">{monthPatientRows.newCount}<span className="text-xs">人</span></p>
                <p className="text-[10px] text-gray-500">純新規</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center">
                <p className="text-base font-bold text-green-600">{monthPatientRows.existingCount}<span className="text-xs">人</span></p>
                <p className="text-[10px] text-gray-500">既存</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {monthPatientRows.rows.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">データがありません</p>
              ) : (
                <ul className="divide-y">
                  {monthPatientRows.rows.map(r => (
                    <li key={r.patient_id}>
                      {r.patient_id !== '__no_id__' ? (
                        <Link href={`/patients/${r.patient_id}`} className="flex justify-between items-center px-4 py-3 hover:bg-gray-50">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{r.patient_name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${r.isNew ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                {r.isNew ? '純新規' : '既存'}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5">{r.visits}件</p>
                          </div>
                          <span className="font-bold text-sm shrink-0 ml-3">{r.revenue.toLocaleString()}円</span>
                        </Link>
                      ) : (
                        <div className="flex justify-between items-center px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-sm text-gray-500">{r.patient_name}</span>
                            <p className="text-[11px] text-gray-400 mt-0.5">{r.visits}件</p>
                          </div>
                          <span className="font-bold text-sm shrink-0 ml-3">{r.revenue.toLocaleString()}円</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
