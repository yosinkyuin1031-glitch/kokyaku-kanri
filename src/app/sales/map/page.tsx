'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { saleTabs } from '@/lib/saleTabs'
import { getClinicId } from '@/lib/clinic'
import type { MapMarker } from '@/components/LeafletMap'

// Dynamic import to avoid SSR issues with Leaflet
const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false })

interface PatientRow {
  id: string
  name: string
  prefecture: string
  city: string
  ltv: number
  visit_count: number
}

interface CityData {
  city: string
  prefecture: string
  count: number
  totalLtv: number
  avgLtv: number
  patients: { id: string; name: string; ltv: number }[]
}

interface PrefData {
  prefecture: string
  totalCount: number
  totalLtv: number
  cities: CityData[]
}

type ViewMode = 'map' | 'heatmap' | 'table'

export default function MapPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [prefData, setPrefData] = useState<PrefData[]>([])
  const [allCities, setAllCities] = useState<CityData[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedPref, setExpandedPref] = useState<string | null>(null)
  const [expandedCity, setExpandedCity] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([])
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeProgress, setGeocodeProgress] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const PAGE_SIZE = 1000
      let allPatients: PatientRow[] = []
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const { data, error } = await supabase
          .from('cm_patients')
          .select('id, name, prefecture, city, ltv, visit_count')
          .eq('clinic_id', clinicId)
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1)

        if (error || !data) break
        allPatients = allPatients.concat(data as PatientRow[])
        hasMore = data.length === PAGE_SIZE
        offset += PAGE_SIZE
      }

      // Group by prefecture → city with LTV
      const prefMap: Record<string, Record<string, { id: string; name: string; ltv: number }[]>> = {}

      allPatients.forEach(p => {
        const pref = p.prefecture || '不明'
        const city = p.city || '不明'
        if (!prefMap[pref]) prefMap[pref] = {}
        if (!prefMap[pref][city]) prefMap[pref][city] = []
        prefMap[pref][city].push({ id: p.id, name: p.name, ltv: p.ltv || 0 })
      })

      const cityList: CityData[] = []
      const result: PrefData[] = Object.entries(prefMap)
        .map(([prefecture, cities]) => {
          const cityArr: CityData[] = Object.entries(cities)
            .map(([city, patients]) => {
              const totalLtv = patients.reduce((s, p) => s + p.ltv, 0)
              const cd: CityData = {
                city,
                prefecture,
                count: patients.length,
                totalLtv,
                avgLtv: patients.length > 0 ? Math.round(totalLtv / patients.length) : 0,
                patients,
              }
              cityList.push(cd)
              return cd
            })
            .sort((a, b) => b.count - a.count)
          return {
            prefecture,
            totalCount: cityArr.reduce((s, c) => s + c.count, 0),
            totalLtv: cityArr.reduce((s, c) => s + c.totalLtv, 0),
            cities: cityArr,
          }
        })
        .sort((a, b) => b.totalCount - a.totalCount)

      setPrefData(result)
      setAllCities(cityList)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Geocode cities for map view
  const geocodeCities = useCallback(async (cities: CityData[]) => {
    // Filter out "不明" and already geocoded
    const toGeocode = cities.filter(c => c.prefecture !== '不明' && c.city !== '不明')
    if (toGeocode.length === 0) return

    setGeocoding(true)
    setGeocodeProgress(`住所を地図座標に変換中... (0/${toGeocode.length})`)

    // Batch geocode in chunks of 20
    const BATCH_SIZE = 20
    const allResults: Record<string, { lat: number; lng: number } | null> = {}

    for (let i = 0; i < toGeocode.length; i += BATCH_SIZE) {
      const batch = toGeocode.slice(i, i + BATCH_SIZE)
      const uniqueCities = Array.from(new Set(batch.map(c => `${c.prefecture}|${c.city}`)))
        .map(key => {
          const [prefecture, city] = key.split('|')
          return { prefecture, city }
        })

      try {
        const res = await fetch('/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cities: uniqueCities }),
        })
        if (res.ok) {
          const { results } = await res.json()
          Object.assign(allResults, results)
        }
      } catch {
        // Continue with what we have
      }

      setGeocodeProgress(`住所を地図座標に変換中... (${Math.min(i + BATCH_SIZE, toGeocode.length)}/${toGeocode.length})`)
    }

    // Build markers from geocoded results
    const markers: MapMarker[] = []
    const cityKeys = new Set<string>()

    toGeocode.forEach(city => {
      const key = `${city.prefecture}${city.city}`
      if (cityKeys.has(key)) return
      cityKeys.add(key)

      const coords = allResults[key]
      if (!coords) return

      // Find all patients in this city
      const cityData = toGeocode.filter(c => c.prefecture === city.prefecture && c.city === city.city)
      const allPatients = cityData.flatMap(c => c.patients)
      const uniquePatients = Array.from(new Map(allPatients.map(p => [p.id, p])).values())
      const totalLtv = uniquePatients.reduce((s, p) => s + p.ltv, 0)

      markers.push({
        lat: coords.lat,
        lng: coords.lng,
        label: `${city.prefecture} ${city.city}`,
        count: uniquePatients.length,
        avgLtv: uniquePatients.length > 0 ? Math.round(totalLtv / uniquePatients.length) : 0,
        totalLtv,
        patients: uniquePatients.map(p => ({ name: p.name, ltv: p.ltv })),
      })
    })

    setMapMarkers(markers)
    setGeocoding(false)
    setGeocodeProgress('')
  }, [])

  // Trigger geocoding when data is loaded and map view is active
  useEffect(() => {
    if (!loading && allCities.length > 0 && mapMarkers.length === 0 && viewMode === 'map') {
      geocodeCities(allCities)
    }
  }, [loading, allCities, viewMode, mapMarkers.length, geocodeCities])

  const totalPatients = prefData.reduce((s, p) => s + p.totalCount, 0)
  const totalCities = prefData.reduce((s, p) => s + p.cities.length, 0)
  const totalLtv = prefData.reduce((s, p) => s + p.totalLtv, 0)
  const maxCount = prefData.length > 0 ? prefData[0].totalCount : 1

  const top3 = prefData.slice(0, 3)
  const top3Count = top3.reduce((s, p) => s + p.totalCount, 0)
  const concentrationPct = totalPatients > 0 ? Math.round((top3Count / totalPatients) * 100) : 0

  const getHeatColor = (count: number, max: number) => {
    if (max === 0) return 'rgba(20,37,42,0.05)'
    const ratio = count / max
    if (ratio > 0.7) return 'rgba(20,37,42,0.9)'
    if (ratio > 0.5) return 'rgba(20,37,42,0.7)'
    if (ratio > 0.3) return 'rgba(20,37,42,0.5)'
    if (ratio > 0.15) return 'rgba(20,37,42,0.3)'
    if (ratio > 0.05) return 'rgba(20,37,42,0.15)'
    return 'rgba(20,37,42,0.07)'
  }

  const getTextColor = (count: number, max: number) => {
    const ratio = max > 0 ? count / max : 0
    return ratio > 0.3 ? '#fff' : '#14252A'
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-2 border-b">
          {saleTabs.map(tab => (
            <Link key={tab.href} href={tab.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                tab.href === '/sales/map' ? 'bg-[#14252A] text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>{tab.label}</Link>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800 text-lg">地域分布</h2>
          <div className="flex gap-1">
            {([
              { key: 'map' as const, label: '📍 マップ' },
              { key: 'heatmap' as const, label: '🟦 ヒートマップ' },
              { key: 'table' as const, label: '📋 テーブル' },
            ]).map(v => (
              <button key={v.key} onClick={() => setViewMode(v.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === v.key ? 'bg-[#14252A] text-white' : 'bg-gray-100 text-gray-500'
                }`}>{v.label}</button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold" style={{ color: '#14252A' }}>{totalPatients}<span className="text-xs sm:text-sm">人</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">総患者数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-blue-600">{prefData.filter(p => p.prefecture !== '不明').length}<span className="text-xs sm:text-sm">件</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">都道府県数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-green-600">{totalCities}<span className="text-xs sm:text-sm">件</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">市区町村数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-2 sm:p-4 text-center">
            <p className="text-lg sm:text-2xl font-bold text-orange-500">{concentrationPct}<span className="text-xs sm:text-sm">%</span></p>
            <p className="text-[10px] sm:text-xs text-gray-500">上位3地域集中率</p>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : (
          <>
            {/* === MAP VIEW === */}
            {viewMode === 'map' && (
              <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                <h3 className="text-sm font-bold text-gray-700 mb-3">患者分布マップ</h3>
                <p className="text-xs text-gray-400 mb-3">円の大きさ＝患者数、色＝平均LTV。クリックで詳細表示</p>
                {geocoding ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-[#14252A] rounded-full animate-spin mb-3" />
                    <p className="text-sm text-gray-500">{geocodeProgress}</p>
                  </div>
                ) : mapMarkers.length > 0 ? (
                  <LeafletMap markers={mapMarkers} height="500px" />
                ) : (
                  <p className="text-center py-16 text-gray-400">住所データがある患者がいません</p>
                )}
              </div>
            )}

            {/* === HEATMAP VIEW === */}
            {viewMode === 'heatmap' && (
              <>
                <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">都道府県ヒートマップ</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {prefData.map(p => (
                      <button
                        key={p.prefecture}
                        onClick={() => {
                          setExpandedPref(expandedPref === p.prefecture ? null : p.prefecture)
                          setExpandedCity(null)
                        }}
                        className="rounded-lg px-2 py-1.5 text-xs font-medium transition-all hover:scale-105"
                        style={{
                          backgroundColor: getHeatColor(p.totalCount, maxCount),
                          color: getTextColor(p.totalCount, maxCount),
                          minWidth: '60px',
                        }}
                      >
                        {p.prefecture}
                        <span className="block text-[10px] opacity-80">{p.totalCount}人</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-400">
                    <span>少</span>
                    <div className="flex gap-0.5">
                      {[0.07, 0.15, 0.3, 0.5, 0.7, 0.9].map(opacity => (
                        <div key={opacity} className="w-6 h-3 rounded" style={{ backgroundColor: `rgba(20,37,42,${opacity})` }} />
                      ))}
                    </div>
                    <span>多</span>
                  </div>
                </div>

                {/* Expanded prefecture detail */}
                {expandedPref && (() => {
                  const pref = prefData.find(p => p.prefecture === expandedPref)
                  if (!pref) return null
                  const cityMax = pref.cities[0]?.count || 1
                  return (
                    <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
                      <h3 className="text-sm font-bold text-gray-700 mb-3">
                        {expandedPref} の市区町村分布
                      </h3>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {pref.cities.map(c => (
                          <button
                            key={c.city}
                            onClick={() => setExpandedCity(expandedCity === `${expandedPref}-${c.city}` ? null : `${expandedPref}-${c.city}`)}
                            className="rounded-lg px-2 py-1.5 text-xs font-medium transition-all hover:scale-105"
                            style={{
                              backgroundColor: getHeatColor(c.count, cityMax),
                              color: getTextColor(c.count, cityMax),
                              minWidth: '70px',
                            }}
                          >
                            {c.city}
                            <span className="block text-[10px] opacity-80">{c.count}人</span>
                          </button>
                        ))}
                      </div>

                      {expandedCity && (() => {
                        const cityName = expandedCity.replace(`${expandedPref}-`, '')
                        const city = pref.cities.find(c => c.city === cityName)
                        if (!city) return null
                        return (
                          <div className="border-t pt-3">
                            <h4 className="text-xs font-bold text-gray-600 mb-2">
                              {expandedPref} {cityName} の患者一覧（{city.count}人）
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
                              {city.patients.map(pt => (
                                <Link
                                  key={pt.id}
                                  href={`/patients/${pt.id}`}
                                  className="text-xs text-blue-600 hover:underline bg-gray-50 rounded px-2 py-1 truncate flex justify-between"
                                >
                                  <span>{pt.name}</span>
                                  {pt.ltv > 0 && <span className="text-gray-400 ml-1">{(pt.ltv / 10000).toFixed(0)}万</span>}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })()}
              </>
            )}

            {/* === TABLE VIEW === */}
            {viewMode === 'table' && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-3 py-2 text-xs text-gray-500">#</th>
                        <th className="text-left px-3 py-2 text-xs text-gray-500">都道府県</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">患者数</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">総LTV</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">平均LTV</th>
                        <th className="text-right px-3 py-2 text-xs text-gray-500">構成比</th>
                        <th className="text-left px-3 py-2 text-xs text-gray-500">上位エリア</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prefData.map((p, i) => (
                        <tr key={p.prefecture} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{p.prefecture}</td>
                          <td className="px-3 py-2 text-right">{p.totalCount}人</td>
                          <td className="px-3 py-2 text-right font-medium">{p.totalLtv.toLocaleString()}円</td>
                          <td className="px-3 py-2 text-right">
                            {p.totalCount > 0 ? Math.round(p.totalLtv / p.totalCount).toLocaleString() : 0}円
                          </td>
                          <td className="px-3 py-2 text-right">
                            {totalPatients > 0 ? Math.round((p.totalCount / totalPatients) * 100) : 0}%
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[200px]">
                            {p.cities.slice(0, 3).map(c => `${c.city}(${c.count})`).join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top areas summary - always visible */}
            <div className="bg-blue-50 rounded-xl p-4 mt-4">
              <h3 className="text-sm font-bold text-gray-700 mb-2">商圏サマリー</h3>
              <div className="space-y-1 text-xs text-gray-600">
                {prefData.slice(0, 5).map((p, i) => (
                  <div key={p.prefecture} className="flex justify-between">
                    <span>{i + 1}. {p.prefecture}（{p.totalCount}人）</span>
                    <span className="font-medium">{p.totalLtv > 0 ? `平均LTV ${Math.round(p.totalLtv / p.totalCount).toLocaleString()}円` : ''}</span>
                  </div>
                ))}
              </div>
              {concentrationPct > 0 && (
                <p className="text-[10px] text-gray-400 mt-2">
                  上位3地域に全患者の{concentrationPct}%が集中しています
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
