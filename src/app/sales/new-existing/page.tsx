'use client'

import { useEffect, useState } from 'react'
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

export default function NewExistingPage() {
  const supabase = createClient()
  const [data, setData] = useState<MonthlyData[]>([])
  const [loading, setLoading] = useState(true)

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

      setData(result)
      setLoading(false)
    }
    load()
  }, [])

  const totalNew = data.reduce((s, d) => s + d.newRevenue, 0)
  const totalExisting = data.reduce((s, d) => s + d.existingRevenue, 0)
  const totalAll = totalNew + totalExisting
  const newRatioTotal = totalAll > 0 ? Math.round((totalNew / totalAll) * 100) : 0

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

        {/* サマリー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{totalNew.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">新規売上合計</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{totalExisting.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">既存売上合計</p>
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
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : (
          <>
          {/* モバイル: カード表示 */}
          <div className="sm:hidden space-y-2">
            {data.length === 0 ? (
              <p className="text-center py-8 text-gray-400">データがありません</p>
            ) : data.map(d => (
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

          {/* PC: テーブル表示 */}
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
                {data.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">データがありません</td></tr>
                ) : data.map(d => (
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
