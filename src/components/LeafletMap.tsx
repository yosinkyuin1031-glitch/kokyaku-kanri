'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapMarker {
  lat: number
  lng: number
  label: string
  count: number
  avgLtv: number
  totalLtv: number
  patients: { name: string; ltv: number }[]
}

interface LeafletMapProps {
  markers: MapMarker[]
  center?: [number, number]
  zoom?: number
  height?: string
}

const getLtvColor = (avgLtv: number) => {
  if (avgLtv >= 500000) return '#dc2626' // red - very high
  if (avgLtv >= 200000) return '#ea580c' // orange - high
  if (avgLtv >= 100000) return '#2563eb' // blue - medium
  if (avgLtv >= 50000) return '#0891b2' // cyan - moderate
  return '#6b7280' // gray - low
}

export default function LeafletMap({ markers, center, zoom = 11, height = '500px' }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!mapRef.current || markers.length === 0) return

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    // Calculate center from markers if not provided
    const mapCenter = center || (() => {
      const avgLat = markers.reduce((s, m) => s + m.lat, 0) / markers.length
      const avgLng = markers.reduce((s, m) => s + m.lng, 0) / markers.length
      return [avgLat, avgLng] as [number, number]
    })()

    const map = L.map(mapRef.current).setView(mapCenter, zoom)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map)

    // Add circle markers
    const maxCount = Math.max(...markers.map(m => m.count), 1)

    markers.forEach(m => {
      const radius = Math.max(Math.sqrt(m.count / maxCount) * 40, 8)
      const color = getLtvColor(m.avgLtv)

      const circle = L.circleMarker([m.lat, m.lng], {
        radius,
        fillColor: color,
        color: '#fff',
        weight: 2,
        fillOpacity: 0.7,
      }).addTo(map)

      // Popup content
      const patientList = m.patients
        .sort((a, b) => b.ltv - a.ltv)
        .slice(0, 10)
        .map(p => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;padding:1px 0"><span>${p.name}</span><span style="color:#14252A;font-weight:600">${p.ltv.toLocaleString()}円</span></div>`)
        .join('')

      const moreText = m.patients.length > 10 ? `<div style="font-size:10px;color:#999;text-align:center;margin-top:4px">他${m.patients.length - 10}名</div>` : ''

      circle.bindPopup(`
        <div style="min-width:180px;max-width:250px">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;border-bottom:1px solid #eee;padding-bottom:4px">${m.label}</div>
          <div style="display:flex;gap:12px;margin-bottom:6px">
            <div><span style="font-size:10px;color:#888">患者数</span><div style="font-weight:700;font-size:14px">${m.count}人</div></div>
            <div><span style="font-size:10px;color:#888">平均LTV</span><div style="font-weight:700;font-size:14px;color:${color}">${m.avgLtv.toLocaleString()}円</div></div>
          </div>
          <div style="font-size:10px;color:#888;margin-bottom:2px">総LTV: ${m.totalLtv.toLocaleString()}円</div>
          <div style="border-top:1px solid #eee;padding-top:4px;margin-top:4px">
            ${patientList}
            ${moreText}
          </div>
        </div>
      `, { maxWidth: 280 })
    })

    // Fit bounds
    if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [30, 30] })
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [markers, center, zoom])

  return (
    <div>
      <div ref={mapRef} style={{ height, borderRadius: '12px', zIndex: 1 }} />
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 px-1">
        <span className="text-[10px] text-gray-400">平均LTV:</span>
        {[
          { color: '#dc2626', label: '50万円〜' },
          { color: '#ea580c', label: '20万〜' },
          { color: '#2563eb', label: '10万〜' },
          { color: '#0891b2', label: '5万〜' },
          { color: '#6b7280', label: '〜5万円' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color, opacity: 0.7 }} />
            <span className="text-[10px] text-gray-500">{l.label}</span>
          </div>
        ))}
        <span className="text-[10px] text-gray-400 ml-2">※ 円の大きさ = 患者数</span>
      </div>
    </div>
  )
}
