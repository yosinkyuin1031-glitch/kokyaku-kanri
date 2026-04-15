'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { getClinicId } from '@/lib/clinic'

interface AreaData {
  area: string
  prefecture: string
  patientCount: number
  totalLTV: number
  avgLTV: number
  totalVisits: number
  avgVisits: number
  topPatients: { name: string; ltv: number }[]
  referralBreakdown: { source: string; count: number; ltv: number }[]
}

type SortKey = 'totalLTV' | 'patientCount' | 'avgLTV' | 'avgVisits'

export default function AreaLtvPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [areas, setAreas] = useState<AreaData[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('totalLTV')
  const [expandedArea, setExpandedArea] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      // Fetch patients with LTV data directly
      const PAGE_SIZE = 1000
      let allPatients: { id: string; name: string; city: string; prefecture: string; ltv: number; visit_count: number; referral_source: string | null }[] = []
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('cm_patients')
          .select('id, name, city, prefecture, ltv, visit_count, referral_source')
          .eq('clinic_id', clinicId)
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)

        if (error || !data) break
        allPatients = allPatients.concat(data)
        hasMore = data.length === PAGE_SIZE
        offset += PAGE_SIZE
      }

      if (allPatients.length === 0) {
        setLoading(false)
        return
      }

      // Aggregate by city
      const areaMap: Record<string, {
        prefecture: string
        patients: { name: string; ltv: number }[]
        totalLTV: number
        totalVisits: number
        referralMap: Record<string, { count: number; ltv: number }>
      }> = {}

      allPatients.forEach(p => {
        const area = p.city || p.prefecture || '不明'
        if (!areaMap[area]) {
          areaMap[area] = { prefecture: p.prefecture || '不明', patients: [], totalLTV: 0, totalVisits: 0, referralMap: {} }
        }
        const ltv = p.ltv || 0
        const visits = p.visit_count || 0
        areaMap[area].patients.push({ name: p.name, ltv })
        areaMap[area].totalLTV += ltv
        areaMap[area].totalVisits += visits

        const source = p.referral_source || '不明'
        if (!areaMap[area].referralMap[source]) {
          areaMap[area].referralMap[source] = { count: 0, ltv: 0 }
        }
        areaMap[area].referralMap[source].count++
        areaMap[area].referralMap[source].ltv += ltv
      })

      const result: AreaData[] = Object.entries(areaMap).map(([area, d]) => ({
        area,
        prefecture: d.prefecture,
        patientCount: d.patients.length,
        totalLTV: d.totalLTV,
        avgLTV: d.patients.length > 0 ? Math.round(d.totalLTV / d.patients.length) : 0,
        totalVisits: d.totalVisits,
        avgVisits: d.patients.length > 0 ? Math.round((d.totalVisits / d.patients.length) * 10) / 10 : 0,
        topPatients: d.patients.sort((a, b) => b.ltv - a.ltv).slice(0, 5),
        referralBreakdown: Object.entries(d.referralMap)
          .map(([source, v]) => ({ source, count: v.count, ltv: v.ltv }))
          .sort((a, b) => b.count - a.count),
      }))

      setAreas(result)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sorted = [...areas].sort((a, b) => {
    if (sortKey === 'totalLTV') return b.totalLTV - a.totalLTV
    if (sortKey === 'patientCount') return b.patientCount - a.patientCount
    if (sortKey === 'avgLTV') return b.avgLTV - a.avgLTV
    return b.avgVisits - a.avgVisits
  })

  const maxLTV = sorted.length > 0 ? sorted[0].totalLTV : 1
  const totalPatients = areas.reduce((s, a) => s + a.patientCount, 0)
  const totalLTV = areas.reduce((s, a) => s + a.totalLTV, 0)
  const overallAvgLTV = totalPatients > 0 ? Math.round(totalLTV / totalPatients) : 0

  // Best performing area
  const bestAvgArea = [...areas].sort((a, b) => b.avgLTV - a.avgLTV).find(a => a.patientCount >= 3)

  // Overall referral breakdown
  const overallReferral: Record<string, { count: number; ltv: number }> = {}
  areas.forEach(a => {
    a.referralBreakdown.forEach(r => {
      if (!overallReferral[r.source]) overallReferral[r.source] = { count: 0, ltv: 0 }
      overallReferral[r.source].count += r.count
      overallReferral[r.source].ltv += r.ltv
    })
  })
  const referralList = Object.entries(overallReferral)
    .map(([source, v]) => ({ source, count: v.count, ltv: v.ltv }))
    .sort((a, b) => b.count - a.count)

  const REFERRAL_COLORS = ['#14252A', '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d']

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/area-ltv' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>{tab.label}</Link>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 text-lg">エリア別LTV分析</h2>
          <Link href="/sales/map" className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            📍 マップで見る →
          </Link>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold" style={{ color: '#14252A' }}>{areas.length}<span className="text-xs sm:text-sm">エリア</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">対象エリア数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{totalPatients}<span className="text-xs sm:text-sm">人</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">総患者数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{overallAvgLTV.toLocaleString()}<span className="text-xs sm:text-sm">円</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">全体平均LTV</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-sm sm:text-base font-bold text-orange-500 truncate">{bestAvgArea?.area || '-'}</p>
            <p className="text-[10px] sm:text-xs text-gray-500">最高平均LTVエリア</p>
          </div>
        </div>

        {/* Sort buttons */}
        <div className="flex gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500 pt-1">並び替え:</span>
          {([
            { key: 'totalLTV' as const, label: '総LTV' },
            { key: 'patientCount' as const, label: '患者数' },
            { key: 'avgLTV' as const, label: '平均LTV' },
            { key: 'avgVisits' as const, label: '来院頻度' },
          ]).map(s => (
            <button key={s.key} onClick={() => setSortKey(s.key)}
              className={`px-3 py-1 rounded text-xs ${sortKey === s.key ? 'bg-[#14252A] text-white' : 'bg-gray-100 text-gray-600'}`}
            >{s.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3 py-4" role="status" aria-label="読み込み中"><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /></div>
        ) : (
          <>
            {/* Bar Chart */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">
                エリア別 {sortKey === 'totalLTV' ? '総LTV' : sortKey === 'patientCount' ? '患者数' : sortKey === 'avgLTV' ? '平均LTV' : '来院頻度'}ランキング（上位10）
              </h3>
              <div className="space-y-2">
                {sorted.slice(0, 10).map((a, i) => {
                  const value = sortKey === 'totalLTV' ? a.totalLTV : sortKey === 'patientCount' ? a.patientCount : sortKey === 'avgLTV' ? a.avgLTV : a.avgVisits
                  const maxVal = sortKey === 'totalLTV' ? maxLTV : sorted[0]?.[sortKey] || 1
                  const displayValue = sortKey === 'avgVisits' ? `${a.avgVisits}回` : sortKey === 'patientCount' ? `${a.patientCount}人` : `${value.toLocaleString()}円`
                  return (
                    <div key={a.area} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                      <span className="text-xs font-medium w-20 sm:w-28 truncate">{a.area}</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full rounded flex items-center px-2"
                          style={{
                            width: `${Math.max((value / maxVal) * 100, 2)}%`,
                            backgroundColor: '#14252A',
                            opacity: 1 - (i * 0.06),
                          }}
                        >
                          <span className="text-[10px] text-white whitespace-nowrap">
                            {displayValue}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 w-10 text-right">{a.patientCount}人</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Referral Summary */}
            {referralList.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <h3 className="text-sm font-bold text-gray-700 mb-3">媒体別 集客内訳</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {referralList.map((r, i) => (
                    <div key={r.source} className="rounded-lg p-2 border" style={{ borderLeftWidth: 3, borderLeftColor: REFERRAL_COLORS[i % REFERRAL_COLORS.length] }}>
                      <p className="text-xs font-medium truncate">{r.source}</p>
                      <p className="text-sm font-bold">{r.count}人</p>
                      <p className="text-[10px] text-gray-500">LTV合計 {r.ltv.toLocaleString()}円</p>
                      <p className="text-[10px] text-gray-400">平均 {r.count > 0 ? Math.round(r.ltv / r.count).toLocaleString() : 0}円</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mobile cards */}
            <div className="sm:hidden space-y-2">
              {sorted.map((a, i) => (
                <button key={a.area} onClick={() => setExpandedArea(expandedArea === a.area ? null : a.area)}
                  className="w-full text-left bg-white rounded-xl shadow-sm p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs text-gray-400 mr-1">#{i + 1}</span>
                      <span className="font-medium text-sm">{a.area}</span>
                      <span className="text-[10px] text-gray-400 ml-1">{a.prefecture}</span>
                    </div>
                    <p className="font-bold text-sm" style={{ color: '#14252A' }}>{a.totalLTV.toLocaleString()}円</p>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    <span>{a.patientCount}人</span>
                    <span>平均{a.avgLTV.toLocaleString()}円</span>
                    <span>来院{a.avgVisits}回</span>
                  </div>
                  {expandedArea === a.area && (
                    <div className="border-t mt-2 pt-2 space-y-2">
                      {a.referralBreakdown.length > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-400 mb-1">媒体別内訳</p>
                          {a.referralBreakdown.map((r, j) => (
                            <div key={j} className="flex justify-between text-xs">
                              <span style={{ color: REFERRAL_COLORS[j % REFERRAL_COLORS.length] }}>{r.source}</span>
                              <span className="text-gray-500">{r.count}人 / {r.ltv.toLocaleString()}円</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {a.topPatients.length > 0 && (
                        <div>
                          <p className="text-[10px] text-gray-400 mb-1">LTV上位</p>
                          {a.topPatients.map((p, j) => (
                            <div key={j} className="flex justify-between text-xs">
                              <span>{p.name}</span>
                              <span className="text-gray-500">{p.ltv.toLocaleString()}円</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left px-3 py-2 text-xs text-gray-500">#</th>
                      <th className="text-left px-3 py-2 text-xs text-gray-500">エリア</th>
                      <th className="text-left px-3 py-2 text-xs text-gray-500">都道府県</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">患者数</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">総LTV</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">平均LTV</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">総来院数</th>
                      <th className="text-right px-3 py-2 text-xs text-gray-500">平均来院</th>
                      <th className="text-left px-3 py-2 text-xs text-gray-500">主要媒体</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((a, i) => (
                      <React.Fragment key={a.area}>
                        <tr className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => setExpandedArea(expandedArea === a.area ? null : a.area)}>
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{a.area}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{a.prefecture}</td>
                          <td className="px-3 py-2 text-right">{a.patientCount}人</td>
                          <td className="px-3 py-2 text-right font-medium">{a.totalLTV.toLocaleString()}円</td>
                          <td className="px-3 py-2 text-right">{a.avgLTV.toLocaleString()}円</td>
                          <td className="px-3 py-2 text-right">{a.totalVisits}回</td>
                          <td className="px-3 py-2 text-right">{a.avgVisits}回</td>
                          <td className="px-3 py-2 text-xs">
                            {a.referralBreakdown.slice(0, 2).map((r, j) => (
                              <span key={j} className="inline-block mr-1 px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: `${REFERRAL_COLORS[j % REFERRAL_COLORS.length]}15`, color: REFERRAL_COLORS[j % REFERRAL_COLORS.length] }}>
                                {r.source}({r.count})
                              </span>
                            ))}
                          </td>
                        </tr>
                        {expandedArea === a.area && (
                          <tr className="bg-gray-50">
                            <td colSpan={9} className="px-6 py-3">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-[10px] text-gray-400 mb-1 font-bold">媒体別内訳</p>
                                  {a.referralBreakdown.map((r, j) => (
                                    <div key={j} className="flex justify-between text-xs py-0.5">
                                      <span style={{ color: REFERRAL_COLORS[j % REFERRAL_COLORS.length] }}>{r.source}</span>
                                      <span className="text-gray-500">{r.count}人 / LTV {r.ltv.toLocaleString()}円</span>
                                    </div>
                                  ))}
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-400 mb-1 font-bold">LTV上位</p>
                                  {a.topPatients.map((p, j) => (
                                    <div key={j} className="flex justify-between text-xs py-0.5">
                                      <span>{p.name}</span>
                                      <span className="text-gray-500">{p.ltv.toLocaleString()}円</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Insights */}
            <div className="bg-blue-50 rounded-xl p-4 mt-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2">分析のポイント</h3>
              <div className="space-y-1 text-xs text-gray-600">
                {bestAvgArea && (
                  <p>- 平均LTV最高エリアは<strong>{bestAvgArea.area}</strong>（{bestAvgArea.avgLTV.toLocaleString()}円 / {bestAvgArea.patientCount}人）</p>
                )}
                {sorted[0] && (
                  <p>- 売上貢献1位は<strong>{sorted[0].area}</strong>（総LTV {sorted[0].totalLTV.toLocaleString()}円）</p>
                )}
                <p className="text-[10px] text-gray-400 mt-2">※ 行をタップすると上位患者を表示</p>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
