'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'
import type { Patient, Slip } from '@/lib/types'

interface TodaySlip extends Slip {
  patient?: Patient
}

export default function HomePage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [todaySlips, setTodaySlips] = useState<TodaySlip[]>([])
  const [recentPatients, setRecentPatients] = useState<Patient[]>([])
  const [stats, setStats] = useState({ totalPatients: 0, monthVisits: 0, todayVisits: 0, todayRevenue: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0]
      const monthStart = today.slice(0, 7) + '-01'

      const [patientsRes, todayRes, monthRes] = await Promise.all([
        supabase.from('cm_patients').select('*').eq('clinic_id', clinicId).eq('status', 'active').order('updated_at', { ascending: false }).limit(5),
        supabase.from('cm_slips').select('*').eq('clinic_id', clinicId).eq('visit_date', today).order('created_at', { ascending: false }),
        supabase.from('cm_slips').select('id, total_price', { count: 'exact' }).eq('clinic_id', clinicId).gte('visit_date', monthStart),
      ])

      const { count: totalPatients } = await supabase.from('cm_patients').select('id', { count: 'exact' }).eq('clinic_id', clinicId)

      setRecentPatients(patientsRes.data || [])
      setTodaySlips(todayRes.data || [])
      const todayRevenue = (todayRes.data || []).reduce((sum: number, s: Slip) => sum + (s.total_price || 0), 0)
      setStats({
        totalPatients: totalPatients || 0,
        monthVisits: monthRes.count || 0,
        todayVisits: todayRes.data?.length || 0,
        todayRevenue,
      })
      setLoading(false)
    }
    load()
  }, [])

  return (
    <AppShell>
      <Header title="顧客管理シート" />
      <div className="px-4 py-5 max-w-lg mx-auto">

        {/* 統計カード */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 text-center border-l-4" style={{ borderLeftColor: '#14252A' }}>
            <div className="text-2xl mb-1">👥</div>
            <p className="text-2xl sm:text-3xl font-bold" style={{ color: '#14252A' }}>{stats.totalPatients}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">総患者数</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 text-center border-l-4 border-l-blue-500">
            <div className="text-2xl mb-1">📋</div>
            <p className="text-2xl sm:text-3xl font-bold text-blue-600">{stats.monthVisits}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">今月の施術</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-3 sm:p-4 text-center border-l-4 border-l-green-500">
            <div className="text-2xl mb-1">✅</div>
            <p className="text-2xl sm:text-3xl font-bold text-green-600">{stats.todayVisits}</p>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">本日の施術</p>
          </div>
        </div>

        {/* クイックアクション */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Link href="/patients/new" className="text-white rounded-xl p-3 text-center font-bold shadow-sm text-xs" style={{ background: '#14252A' }}>
            + 新規患者
          </Link>
          <Link href="/visits/new" className="bg-blue-600 text-white rounded-xl p-3 text-center font-bold shadow-sm text-xs">
            + 施術記録
          </Link>
          <Link href="/visits/quick" className="bg-green-600 text-white rounded-xl p-3 text-center font-bold shadow-sm text-xs">
            一括入力
          </Link>
          <Link href="/visits/import" className="bg-white border-2 border-gray-200 text-gray-700 rounded-xl p-3 text-center font-bold shadow-sm text-xs hover:bg-gray-50">
            CSV取込
          </Link>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-8">読み込み中...</p>
        ) : (
          <>
            {/* 本日の施術 */}
            <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-gray-800 text-base">🩺 本日の施術</h2>
                {stats.todayRevenue > 0 && (
                  <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ color: '#14252A', background: 'rgba(20,37,42,0.08)' }}>{stats.todayRevenue.toLocaleString()}円</span>
                )}
              </div>
              {todaySlips.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">本日の施術記録はありません</p>
              ) : (
                <div className="space-y-2">
                  {todaySlips.map(s => (
                    <Link key={s.id} href={`/patients/${s.patient_id}`} className="block border border-gray-100 rounded-lg p-3.5 hover:bg-gray-50 hover:shadow-sm">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-sm">{s.patient_name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{s.menu_name}</p>
                        </div>
                        <span className="text-xs font-semibold bg-green-50 text-green-700 px-3 py-1.5 rounded-full border border-green-100">
                          {(s.total_price || 0).toLocaleString()}円
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* 最近の患者 */}
            <div className="bg-white rounded-xl shadow-sm p-5 mb-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-gray-800 text-base">👤 最近の患者</h2>
                <Link href="/patients" className="text-xs text-blue-600 font-medium hover:text-blue-800">すべて見る →</Link>
              </div>
              {recentPatients.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">患者データがありません</p>
              ) : (
                <div className="space-y-2">
                  {recentPatients.map(p => (
                    <Link key={p.id} href={`/patients/${p.id}`} className="block border border-gray-100 rounded-lg p-3.5 hover:bg-gray-50 hover:shadow-sm">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.status === 'active' ? 'bg-green-500' : p.status === 'completed' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                          <div>
                            <p className="font-bold text-sm">{p.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{p.chief_complaint?.slice(0, 20)}</p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${p.status === 'active' ? 'text-green-700 bg-green-50' : p.status === 'completed' ? 'text-blue-700 bg-blue-50' : 'text-gray-500 bg-gray-50'}`}>
                          {p.status === 'active' ? '通院中' : p.status === 'completed' ? '卒業' : '休止'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
