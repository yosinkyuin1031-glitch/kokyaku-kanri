'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { fetchAllSlips } from '@/lib/fetchAll'
import { getClinicId } from '@/lib/clinic'

interface RepeatData {
  month: string
  newPatients: number
  repeatPatients: number
  repeatRate: number
  totalVisits: number
  newVisits: number
  repeatVisits: number
}

interface PatientRepeat {
  id: string
  name: string
  visitCount: number
  totalRevenue: number
  firstVisit: string
  lastVisit: string
}

export default function RepeatPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [data, setData] = useState<RepeatData[]>([])
  const [patientRepeats, setPatientRepeats] = useState<PatientRepeat[]>([])
  const [viewMode, setViewMode] = useState<'monthly' | 'patient'>('monthly')
  const [period, setPeriod] = useState('month')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()))
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
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

      // 全期間のvisitsを取得（初回来院判定のため）
      const allVisits = await fetchAllSlips(supabase, 'patient_id, visit_date, total_price') as { patient_id: string; visit_date: string; total_price: number }[]

      const { data: patients } = await supabase
        .from('cm_patients')
        .select('id, name')
        .eq('clinic_id', clinicId)

      if (!allVisits || allVisits.length === 0 || !patients) { setData([]); setPatientRepeats([]); setLoading(false); return }

      const patientNameMap: Record<string, string> = {}
      patients.forEach(p => { patientNameMap[p.id] = p.name })

      // 初回来院月を全期間から取得
      const firstVisitMonth: Record<string, string> = {}
      allVisits.forEach(v => {
        const month = v.visit_date.slice(0, 7)
        if (!firstVisitMonth[v.patient_id] || month < firstVisitMonth[v.patient_id]) {
          firstVisitMonth[v.patient_id] = month
        }
      })

      // フィルタ対象のvisitsを抽出
      const filteredVisits = allVisits.filter(v => v.visit_date >= queryStart && v.visit_date <= queryEnd)

      // 月別集計
      const monthMap: Record<string, { patients: Set<string>, newPatients: Set<string>, totalVisits: number, newVisits: number, repeatVisits: number }> = {}

      filteredVisits.forEach(v => {
        const month = v.visit_date.slice(0, 7)
        if (!monthMap[month]) monthMap[month] = { patients: new Set(), newPatients: new Set(), totalVisits: 0, newVisits: 0, repeatVisits: 0 }
        monthMap[month].patients.add(v.patient_id)
        monthMap[month].totalVisits++
        if (firstVisitMonth[v.patient_id] === month) {
          monthMap[month].newPatients.add(v.patient_id)
          monthMap[month].newVisits++
        } else {
          monthMap[month].repeatVisits++
        }
      })

      const result: RepeatData[] = Object.entries(monthMap)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, d]) => {
          const total = d.patients.size
          const newP = d.newPatients.size
          const repeatP = total - newP
          return {
            month,
            newPatients: newP,
            repeatPatients: repeatP,
            repeatRate: total > 0 ? Math.round((repeatP / total) * 100) : 0,
            totalVisits: d.totalVisits,
            newVisits: d.newVisits,
            repeatVisits: d.repeatVisits,
          }
        })

      setData(result)

      // 患者別リピート回数集計（フィルタ期間内）
      const patMap: Record<string, { count: number, revenue: number, first: string, last: string }> = {}
      filteredVisits.forEach(v => {
        if (!patMap[v.patient_id]) patMap[v.patient_id] = { count: 0, revenue: 0, first: v.visit_date, last: v.visit_date }
        patMap[v.patient_id].count++
        patMap[v.patient_id].revenue += v.total_price || 0
        if (v.visit_date < patMap[v.patient_id].first) patMap[v.patient_id].first = v.visit_date
        if (v.visit_date > patMap[v.patient_id].last) patMap[v.patient_id].last = v.visit_date
      })

      const patRepeats: PatientRepeat[] = Object.entries(patMap)
        .map(([id, d]) => ({
          id,
          name: patientNameMap[id] || '不明',
          visitCount: d.count,
          totalRevenue: d.revenue,
          firstVisit: d.first,
          lastVisit: d.last,
        }))
        .sort((a, b) => b.visitCount - a.visitCount)

      setPatientRepeats(patRepeats)
      setLoading(false)
    }
    load()
  }, [period, selectedMonth, selectedYear, startDate, endDate])

  const avgRepeatRate = data.length > 0
    ? Math.round(data.reduce((sum, d) => sum + d.repeatRate, 0) / data.length)
    : 0

  // 来院回数分布（1回, 2回, 3回, 4回, 5回, 6〜9回, 10回以上）
  const distBuckets = [
    { key: 1, label: '1回' },
    { key: 2, label: '2回' },
    { key: 3, label: '3回' },
    { key: 4, label: '4回' },
    { key: 5, label: '5回' },
    { key: 6, label: '6〜9回' },
    { key: 10, label: '10回以上' },
  ]

  const countDist: Record<number, number> = {}
  patientRepeats.forEach(p => {
    let bucket: number
    if (p.visitCount <= 5) {
      bucket = p.visitCount
    } else if (p.visitCount <= 9) {
      bucket = 6
    } else {
      bucket = 10
    }
    countDist[bucket] = (countDist[bucket] || 0) + 1
  })

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/repeat' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >{tab.label}</Link>
          ))}
        </div>

        <h2 className="font-bold text-gray-800 text-lg mb-4">リピート分析</h2>

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

        <div className="flex items-center justify-end mb-4">
          <div className="flex gap-1">
            <button onClick={() => setViewMode('monthly')}
              className={`px-3 py-1 rounded text-xs font-medium ${viewMode === 'monthly' ? 'bg-[#14252A] text-white' : 'bg-gray-100 text-gray-600'}`}>
              月別推移
            </button>
            <button onClick={() => setViewMode('patient')}
              className={`px-3 py-1 rounded text-xs font-medium ${viewMode === 'patient' ? 'bg-[#14252A] text-white' : 'bg-gray-100 text-gray-600'}`}>
              回数別
            </button>
          </div>
        </div>

        {/* サマリー */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold" style={{ color: '#14252A' }}>{avgRepeatRate}<span className="text-xs sm:text-sm">%</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">平均リピート率</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold text-blue-600">{patientRepeats.length}<span className="text-xs sm:text-sm">人</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">総患者数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold text-green-600">{patientRepeats.filter(p => p.visitCount >= 2).length}<span className="text-xs sm:text-sm">人</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">リピーター(2回+)</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold text-orange-600">
              {patientRepeats.length > 0 ? (patientRepeats.reduce((s, p) => s + p.visitCount, 0) / patientRepeats.length).toFixed(1) : 0}
              <span className="text-xs sm:text-sm">回</span>
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500">平均来院回数</p>
          </div>
        </div>

        {/* 来院回数分布 */}
        {viewMode === 'patient' && patientRepeats.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <h3 className="font-bold text-gray-800 text-sm mb-3">来院回数分布</h3>
            <div className="space-y-2">
              {distBuckets.map(b => {
                const count = countDist[b.key] || 0
                const maxCount = Math.max(...Object.values(countDist), 1)
                return (
                  <div key={b.key} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-16 text-right">{b.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
                      <div className="h-5 rounded-full flex items-center px-2"
                        style={{ width: `${maxCount > 0 ? (count / maxCount * 100) : 0}%`, background: '#14252A', minWidth: count > 0 ? '24px' : '0' }}>
                        {count > 0 && <span className="text-white text-[10px] font-bold">{count}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-8">{count}人</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : viewMode === 'patient' ? (
          <>
          {/* 患者別リピート一覧 */}
          <div className="sm:hidden space-y-2">
            {patientRepeats.map((p, i) => (
              <Link key={p.id} href={`/patients/${p.id}`} className="block bg-white rounded-xl shadow-sm p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs text-gray-400 mr-1">#{i + 1}</span>
                    <span className="font-medium text-sm text-blue-600">{p.name}</span>
                  </div>
                  <span className="font-bold text-sm" style={{ color: '#14252A' }}>{p.visitCount}回</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-gray-500">
                  <span>{p.totalRevenue.toLocaleString()}円</span>
                  <span>初回{p.firstVisit}</span>
                </div>
              </Link>
            ))}
          </div>
          <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-3 py-2 text-xs text-gray-500">#</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500">患者名</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">来院回数</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">総売上</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500">初回</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-500">最終</th>
                </tr>
              </thead>
              <tbody>
                {patientRepeats.map((p, i) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/patients/${p.id}`} className="text-blue-600 hover:underline font-medium">{p.name}</Link>
                    </td>
                    <td className="px-3 py-2 text-right font-bold">{p.visitCount}回</td>
                    <td className="px-3 py-2 text-right">{p.totalRevenue.toLocaleString()}円</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{p.firstVisit}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{p.lastVisit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          </>
        ) : (
          <>
          {/* 月別推移 */}
          <div className="sm:hidden space-y-2">
            {data.length === 0 ? (
              <p className="text-center py-8 text-gray-400">データがありません</p>
            ) : data.map(d => (
              <div key={d.month} className="bg-white rounded-xl shadow-sm p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-sm">{d.month}</span>
                  <span className="font-bold text-sm" style={{ color: '#14252A' }}>{d.repeatRate}%</span>
                </div>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span>来院{d.totalVisits}件</span>
                  <span className="text-blue-600">新規{d.newPatients}人({d.newVisits}件)</span>
                  <span className="text-green-600">既存{d.repeatPatients}人({d.repeatVisits}件)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div className="h-2 rounded-full" style={{ width: `${d.repeatRate}%`, background: '#14252A' }} />
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
                  <th className="text-right px-3 py-2 text-xs text-gray-500">総来院数</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">新規人数</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">新規回数</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">既存人数</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">既存回数</th>
                  <th className="text-right px-3 py-2 text-xs text-gray-500">リピート率</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">データがありません</td></tr>
                ) : data.map(d => (
                  <tr key={d.month} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{d.month}</td>
                    <td className="px-3 py-2 text-right">{d.totalVisits}件</td>
                    <td className="px-3 py-2 text-right text-blue-600">{d.newPatients}人</td>
                    <td className="px-3 py-2 text-right text-blue-400">{d.newVisits}件</td>
                    <td className="px-3 py-2 text-right text-green-600">{d.repeatPatients}人</td>
                    <td className="px-3 py-2 text-right text-green-400">{d.repeatVisits}件</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div className="h-2 rounded-full" style={{ width: `${d.repeatRate}%`, background: '#14252A' }} />
                        </div>
                        <span className="font-medium">{d.repeatRate}%</span>
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
