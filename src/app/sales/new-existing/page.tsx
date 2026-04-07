'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'

interface MonthlyData {
  month: string
  newRevenue: number
  existingRevenue: number
  totalRevenue: number
  newCount: number
  existingCount: number
  newRatio: number
}

interface YearlyData {
  year: string
  newRevenue: number
  existingRevenue: number
  totalRevenue: number
  newCount: number
  existingCount: number
  newRatio: number
  months: MonthlyData[]
}

type PeriodKey = 'month' | 'year' | 'all' | 'custom'

export default function NewExistingPage() {
  const supabase = createClient()
  const [allData, setAllData] = useState<MonthlyData[]>([])
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
      const slips = await fetchAllSlips(supabase, 'patient_id, visit_date, total_price') as { patient_id: string; visit_date: string; total_price: number }[]

      if (!slips || slips.length === 0) { setLoading(false); return }

      // 各患者の初回来院月を特定
      const firstVisitMonth: Record<string, string> = {}
      slips.forEach(s => {
        if (!s.patient_id) return
        const month = s.visit_date.slice(0, 7)
        if (!firstVisitMonth[s.patient_id] || month < firstVisitMonth[s.patient_id]) {
          firstVisitMonth[s.patient_id] = month
        }
      })

      const monthMap: Record<string, { newRev: number, existRev: number, newCount: number, existCount: number }> = {}

      slips.forEach(s => {
        const month = s.visit_date.slice(0, 7)
        if (!monthMap[month]) monthMap[month] = { newRev: 0, existRev: 0, newCount: 0, existCount: 0 }
        const amount = s.total_price || 0

        if (s.patient_id && firstVisitMonth[s.patient_id] === month) {
          monthMap[month].newRev += amount
          monthMap[month].newCount++
        } else {
          monthMap[month].existRev += amount
          monthMap[month].existCount++
        }
      })

      const result: MonthlyData[] = Object.entries(monthMap)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, d]) => ({
          month,
          newRevenue: d.newRev,
          existingRevenue: d.existRev,
          totalRevenue: d.newRev + d.existRev,
          newCount: d.newCount,
          existingCount: d.existCount,
          newRatio: (d.newRev + d.existRev) > 0
            ? Math.round((d.newRev / (d.newRev + d.existRev)) * 100)
            : 0,
        }))

      setAllData(result)
      setLoading(false)
    }
    load()
  }, [])

  // フィルタ済みデータ
  const filtered = useMemo(() => {
    if (period === 'all') return allData
    if (period === 'month') return allData.filter(d => d.month === selectedMonth)
    if (period === 'year') return allData.filter(d => d.month.startsWith(selectedYear))
    if (period === 'custom') {
      const from = startDate.slice(0, 7)
      const to = endDate.slice(0, 7)
      return allData.filter(d => d.month >= from && d.month <= to)
    }
    return allData
  }, [allData, period, selectedMonth, selectedYear, startDate, endDate])

  // 年別集計
  const yearlyData = useMemo((): YearlyData[] => {
    const yearMap: Record<string, MonthlyData[]> = {}
    filtered.forEach(d => {
      const year = d.month.slice(0, 4)
      if (!yearMap[year]) yearMap[year] = []
      yearMap[year].push(d)
    })
    return Object.entries(yearMap)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, months]) => {
        const newRev = months.reduce((s, m) => s + m.newRevenue, 0)
        const existRev = months.reduce((s, m) => s + m.existingRevenue, 0)
        const total = newRev + existRev
        return {
          year,
          newRevenue: newRev,
          existingRevenue: existRev,
          totalRevenue: total,
          newCount: months.reduce((s, m) => s + m.newCount, 0),
          existingCount: months.reduce((s, m) => s + m.existingCount, 0),
          newRatio: total > 0 ? Math.round((newRev / total) * 100) : 0,
          months: months.sort((a, b) => a.month.localeCompare(b.month)),
        }
      })
  }, [filtered])

  const totalNew = filtered.reduce((s, d) => s + d.newRevenue, 0)
  const totalExisting = filtered.reduce((s, d) => s + d.existingRevenue, 0)
  const totalAll = totalNew + totalExisting
  const newRatioTotal = totalAll > 0 ? Math.round((totalNew / totalAll) * 100) : 0
  const totalNewCount = filtered.reduce((s, d) => s + d.newCount, 0)
  const totalExistCount = filtered.reduce((s, d) => s + d.existingCount, 0)

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

        {/* サマリー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{totalNew.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">新規売上（{totalNewCount}件）</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{totalExisting.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">既存売上（{totalExistCount}件）</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold" style={{ color: '#14252A' }}>{totalAll.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">総売上</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-orange-600">{newRatioTotal}<span className="text-xs sm:text-sm">%</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">新規比率</p>
          </div>
        </div>

        {/* 新規/既存バー */}
        {totalAll > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <div className="flex h-8 rounded-lg overflow-hidden">
              <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-bold"
                style={{ width: `${newRatioTotal}%` }}>
                {newRatioTotal > 10 && `新規 ${newRatioTotal}%`}
              </div>
              <div className="bg-green-500 flex items-center justify-center text-white text-xs font-bold"
                style={{ width: `${100 - newRatioTotal}%` }}>
                {(100 - newRatioTotal) > 10 && `既存 ${100 - newRatioTotal}%`}
              </div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>新規: {totalNew.toLocaleString()}円</span>
              <span>既存: {totalExisting.toLocaleString()}円</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="animate-pulse space-y-3 py-4" role="status" aria-label="読み込み中"><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /></div>
        ) : period === 'year' && yearlyData.length > 0 ? (
          <>
          {/* 年間ビュー: 年サマリー + 月別内訳 */}
          {yearlyData.map(yd => (
            <div key={yd.year} className="mb-6">
              {/* 年間サマリーカード */}
              <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
                <h3 className="font-bold text-gray-800 mb-3">{yd.year}年 サマリー</h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-blue-600">{yd.newRevenue.toLocaleString()}<span className="text-xs">円</span></p>
                    <p className="text-[10px] text-gray-500">新規（{yd.newCount}件）</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{yd.existingRevenue.toLocaleString()}<span className="text-xs">円</span></p>
                    <p className="text-[10px] text-gray-500">既存（{yd.existingCount}件）</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold" style={{ color: '#14252A' }}>{yd.totalRevenue.toLocaleString()}<span className="text-xs">円</span></p>
                    <p className="text-[10px] text-gray-500">合計</p>
                  </div>
                </div>
                <div className="flex h-6 rounded-lg overflow-hidden">
                  <div className="bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ width: `${yd.newRatio}%` }}>
                    {yd.newRatio > 10 && `${yd.newRatio}%`}
                  </div>
                  <div className="bg-green-500 flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ width: `${100 - yd.newRatio}%` }}>
                    {(100 - yd.newRatio) > 10 && `${100 - yd.newRatio}%`}
                  </div>
                </div>
              </div>

              {/* 月別内訳テーブル */}
              <div className="sm:hidden space-y-2">
                {yd.months.map(d => (
                  <div key={d.month} className="bg-white rounded-xl shadow-sm p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-sm">{d.month.slice(5)}月</span>
                      <span className="font-bold text-sm">{d.totalRevenue.toLocaleString()}円</span>
                    </div>
                    <div className="flex h-3 rounded overflow-hidden mb-1">
                      <div className="bg-blue-500" style={{ width: `${d.newRatio}%` }} />
                      <div className="bg-green-500" style={{ width: `${100 - d.newRatio}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span className="text-blue-600">新規 {d.newRevenue.toLocaleString()}円 ({d.newCount}件)</span>
                      <span className="text-green-600">既存 {d.existingRevenue.toLocaleString()}円 ({d.existingCount}件)</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-3 py-2 text-xs text-gray-500">月</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">新規売上</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">新規件数</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">既存売上</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">既存件数</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">総売上</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">新規比率</th>
                      <th className="px-3 py-2 text-xs text-gray-500 w-32">構成比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yd.months.map(d => (
                      <tr key={d.month} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{d.month.slice(5)}月</td>
                        <td className="px-3 py-2 text-right text-blue-600">{d.newRevenue.toLocaleString()}円</td>
                        <td className="px-3 py-2 text-right text-blue-600">{d.newCount}件</td>
                        <td className="px-3 py-2 text-right text-green-600">{d.existingRevenue.toLocaleString()}円</td>
                        <td className="px-3 py-2 text-right text-green-600">{d.existingCount}件</td>
                        <td className="px-3 py-2 text-right font-medium">{d.totalRevenue.toLocaleString()}円</td>
                        <td className="px-3 py-2 text-right">{d.newRatio}%</td>
                        <td className="px-3 py-2">
                          <div className="flex h-3 rounded overflow-hidden">
                            <div className="bg-blue-500" style={{ width: `${d.newRatio}%` }} />
                            <div className="bg-green-500" style={{ width: `${100 - d.newRatio}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {/* 年合計行 */}
                    <tr className="bg-gray-50 font-bold">
                      <td className="px-3 py-2">合計</td>
                      <td className="px-3 py-2 text-right text-blue-600">{yd.newRevenue.toLocaleString()}円</td>
                      <td className="px-3 py-2 text-right text-blue-600">{yd.newCount}件</td>
                      <td className="px-3 py-2 text-right text-green-600">{yd.existingRevenue.toLocaleString()}円</td>
                      <td className="px-3 py-2 text-right text-green-600">{yd.existingCount}件</td>
                      <td className="px-3 py-2 text-right">{yd.totalRevenue.toLocaleString()}円</td>
                      <td className="px-3 py-2 text-right">{yd.newRatio}%</td>
                      <td className="px-3 py-2">
                        <div className="flex h-3 rounded overflow-hidden">
                          <div className="bg-blue-500" style={{ width: `${yd.newRatio}%` }} />
                          <div className="bg-green-500" style={{ width: `${100 - yd.newRatio}%` }} />
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          ))}
          </>
        ) : (
          <>
          {/* 月別リスト（月別・全期間・期間指定・単月） */}
          <div className="sm:hidden space-y-2">
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-gray-400">データがありません</p>
            ) : filtered.map(d => (
              <div key={d.month} className="bg-white rounded-xl shadow-sm p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-sm">{d.month}</span>
                  <span className="font-bold text-sm">{d.totalRevenue.toLocaleString()}円</span>
                </div>
                <div className="flex h-4 rounded overflow-hidden mb-1">
                  <div className="bg-blue-500" style={{ width: `${d.newRatio}%` }} />
                  <div className="bg-green-500" style={{ width: `${100 - d.newRatio}%` }} />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span className="text-blue-600">新規 {d.newRevenue.toLocaleString()}円 ({d.newCount}件)</span>
                  <span className="text-green-600">既存 {d.existingRevenue.toLocaleString()}円 ({d.existingCount}件)</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2 text-xs text-gray-500">月</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">新規売上</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">新規件数</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">既存売上</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">既存件数</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">総売上</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">新規比率</th>
                  <th className="px-3 py-2 text-xs text-gray-500 w-32">構成比</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">データがありません</td></tr>
                ) : filtered.map(d => (
                  <tr key={d.month} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{d.month}</td>
                    <td className="px-3 py-2 text-right text-blue-600">{d.newRevenue.toLocaleString()}円</td>
                    <td className="px-3 py-2 text-right text-blue-600">{d.newCount}件</td>
                    <td className="px-3 py-2 text-right text-green-600">{d.existingRevenue.toLocaleString()}円</td>
                    <td className="px-3 py-2 text-right text-green-600">{d.existingCount}件</td>
                    <td className="px-3 py-2 text-right font-medium">{d.totalRevenue.toLocaleString()}円</td>
                    <td className="px-3 py-2 text-right">{d.newRatio}%</td>
                    <td className="px-3 py-2">
                      <div className="flex h-3 rounded overflow-hidden">
                        <div className="bg-blue-500" style={{ width: `${d.newRatio}%` }} />
                        <div className="bg-green-500" style={{ width: `${100 - d.newRatio}%` }} />
                      </div>
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
