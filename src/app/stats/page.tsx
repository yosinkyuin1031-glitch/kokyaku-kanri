'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { fetchAllSlips } from '@/lib/fetchAll'
import type { Patient, Slip } from '@/lib/types'
import { getClinicId } from '@/lib/clinic'

interface MonthlyGoal {
  id?: string
  year: number
  month: number
  revenue_goal: number
  new_patient_goal: number
}

interface MonthlyData {
  month: string // YYYY-MM
  revenue: number
  visitCount: number
  newPatients: number
  revenueGoal: number
  newPatientGoal: number
}

export default function StatsPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [slips, setSlips] = useState<Slip[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [period, setPeriod] = useState('year')
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [goals, setGoals] = useState<MonthlyGoal[]>([])
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const now = new Date()
      let startDate: string

      if (period === 'week') {
        const d = new Date(now)
        d.setDate(d.getDate() - 7)
        startDate = d.toISOString().split('T')[0]
      } else if (period === 'month') {
        startDate = now.toISOString().slice(0, 7) + '-01'
      } else {
        startDate = selectedYear + '-01-01'
      }

      const [slipsData, patientsRes, goalsRes] = await Promise.all([
        fetchAllSlips(supabase, '*', { gte: ['visit_date', startDate] }),
        supabase.from('cm_patients').select('*').eq('clinic_id', clinicId),
        supabase.from('cm_monthly_goals').select('*').eq('clinic_id', clinicId).eq('year', selectedYear),
      ])

      setSlips(slipsData || [])
      setPatients(patientsRes.data || [])
      setGoals((goalsRes.data || []).map((g: Record<string, unknown>) => ({
        id: g.id as string,
        year: g.year as number,
        month: g.month as number,
        revenue_goal: Number(g.revenue_goal) || 0,
        new_patient_goal: Number(g.new_patient_goal) || 0,
      })))
      setLoading(false)
    }
    load()
  }, [period, selectedYear])

  const totalRevenue = slips.reduce((sum, s) => sum + (s.total_price || 0), 0)
  const normalTreatments = slips.filter(s => (s.total_price || 0) > 0 && (s.total_price || 0) < 50000)
  const normalRevTotal = normalTreatments.reduce((sum, s) => sum + (s.total_price || 0), 0)
  const avgRevenue = normalTreatments.length > 0 ? Math.round(normalRevTotal / normalTreatments.length) : 0
  const uniquePatients = new Set(slips.map(s => s.patient_id)).size

  // 来院経路別
  const referralCounts: Record<string, number> = {}
  patients.forEach(p => {
    if (p.referral_source) {
      referralCounts[p.referral_source] = (referralCounts[p.referral_source] || 0) + 1
    }
  })
  const referralSorted = Object.entries(referralCounts).sort((a, b) => b[1] - a[1])

  // 支払方法別
  const paymentCounts: Record<string, number> = {}
  slips.forEach(s => {
    if (s.payment_method) {
      paymentCounts[s.payment_method] = (paymentCounts[s.payment_method] || 0) + 1
    }
  })

  const statusCounts = {
    active: patients.filter(p => p.status === 'active').length,
    inactive: patients.filter(p => p.status === 'inactive').length,
    completed: patients.filter(p => p.status === 'completed').length,
  }

  // 年間目標合計
  const yearRevenueGoal = goals.reduce((sum, g) => sum + g.revenue_goal, 0)
  const yearNewPatientGoal = goals.reduce((sum, g) => sum + g.new_patient_goal, 0)

  // 年間新規患者数（first_visit_dateが今年のもの）
  const yearNewPatients = patients.filter(p => {
    if (!p.first_visit_date) return false
    return p.first_visit_date.startsWith(String(selectedYear))
  }).length

  // 月別データ集計
  const monthlyData: MonthlyData[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const monthStr = `${selectedYear}-${String(m).padStart(2, '0')}`
    const monthSlips = slips.filter(s => s.visit_date.startsWith(monthStr))
    const revenue = monthSlips.reduce((sum, s) => sum + (s.total_price || 0), 0)
    const newP = patients.filter(p => p.first_visit_date?.startsWith(monthStr)).length
    const goal = goals.find(g => g.month === m)
    return {
      month: monthStr,
      revenue,
      visitCount: monthSlips.length,
      newPatients: newP,
      revenueGoal: goal?.revenue_goal || 0,
      newPatientGoal: goal?.new_patient_goal || 0,
    }
  })

  // 目標保存
  const saveGoal = async (month: number, field: 'revenue_goal' | 'new_patient_goal', value: number) => {
    const existing = goals.find(g => g.month === month)
    if (existing?.id) {
      await supabase.from('cm_monthly_goals').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', existing.id)
      setGoals(prev => prev.map(g => g.month === month ? { ...g, [field]: value } : g))
    } else {
      const newGoal = { clinic_id: clinicId, year: selectedYear, month, revenue_goal: 0, new_patient_goal: 0, [field]: value }
      const { data } = await supabase.from('cm_monthly_goals').insert(newGoal).select().single()
      if (data) {
        setGoals(prev => [...prev, { id: data.id, year: selectedYear, month, revenue_goal: Number(data.revenue_goal) || 0, new_patient_goal: Number(data.new_patient_goal) || 0 }])
      }
    }
    setEditingCell(null)
  }

  const handleCellClick = (cellKey: string, currentValue: number) => {
    setEditingCell(cellKey)
    setEditValue(currentValue > 0 ? String(currentValue) : '')
  }

  const handleCellSave = (month: number, field: 'revenue_goal' | 'new_patient_goal') => {
    const val = parseInt(editValue) || 0
    saveGoal(month, field, val)
  }

  const pctColor = (pct: number) => pct >= 100 ? 'text-green-600' : pct >= 70 ? 'text-orange-600' : 'text-red-500'

  return (
    <AppShell>
      <Header title="統計" />
      <div className="px-4 py-4 max-w-5xl mx-auto space-y-4">

        {/* 期間選択 */}
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex gap-2">
            {[
              { key: 'week', label: '直近1週間' },
              { key: 'month', label: '今月' },
              { key: 'year', label: '年間' },
            ].map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                  period === p.key ? 'border-[#14252A] bg-[#14252A] text-white' : 'border-gray-200 text-gray-500'
                }`}
              >{p.label}</button>
            ))}
          </div>
          {period === 'year' && (
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {years.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
          )}
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3 py-4" role="status" aria-label="読み込み中"><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /></div>
        ) : (
          <>
            {/* 年間目標サマリー（年間表示時のみ） */}
            {period === 'year' && (
              <div className="bg-gradient-to-r from-[#14252A] to-[#1e3a42] rounded-xl shadow-lg p-5 text-white">
                <h3 className="text-sm font-bold mb-4 opacity-80">{selectedYear}年 目標と実績</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs opacity-60 mb-1">年間売上</p>
                    <p className="text-2xl font-bold">{totalRevenue.toLocaleString()}<span className="text-sm font-normal opacity-60 ml-1">円</span></p>
                    {yearRevenueGoal > 0 && (
                      <>
                        <p className="text-xs opacity-60 mt-1">目標: {yearRevenueGoal.toLocaleString()}円</p>
                        <div className="w-full bg-white/20 rounded-full h-2 mt-2">
                          <div className="h-2 rounded-full bg-green-400 transition-all" style={{ width: `${Math.min(100, Math.round(totalRevenue / yearRevenueGoal * 100))}%` }} />
                        </div>
                        <p className="text-xs mt-1 font-bold">{Math.round(totalRevenue / yearRevenueGoal * 100)}% 達成</p>
                      </>
                    )}
                  </div>
                  <div>
                    <p className="text-xs opacity-60 mb-1">年間新規</p>
                    <p className="text-2xl font-bold">{yearNewPatients}<span className="text-sm font-normal opacity-60 ml-1">人</span></p>
                    {yearNewPatientGoal > 0 && (
                      <>
                        <p className="text-xs opacity-60 mt-1">目標: {yearNewPatientGoal}人</p>
                        <div className="w-full bg-white/20 rounded-full h-2 mt-2">
                          <div className="h-2 rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(100, Math.round(yearNewPatients / yearNewPatientGoal * 100))}%` }} />
                        </div>
                        <p className="text-xs mt-1 font-bold">{Math.round(yearNewPatients / yearNewPatientGoal * 100)}% 達成</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* メイン指標 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl shadow-sm p-5 text-center border-t-4" style={{ borderTopColor: '#14252A' }}>
                <p className="text-xs text-gray-400 mb-1">売上合計</p>
                <p className="text-3xl font-bold" style={{ color: '#14252A' }}>{totalRevenue.toLocaleString()}<span className="text-sm font-normal text-gray-400 ml-0.5">円</span></p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5 text-center border-t-4 border-t-blue-500">
                <p className="text-xs text-gray-400 mb-1">施術件数</p>
                <p className="text-3xl font-bold text-blue-600">{slips.length}<span className="text-sm font-normal text-gray-400 ml-0.5">件</span></p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5 text-center border-t-4 border-t-green-500">
                <p className="text-xs text-gray-400 mb-1">施術単価</p>
                <p className="text-3xl font-bold text-green-600">{avgRevenue.toLocaleString()}<span className="text-sm font-normal text-gray-400 ml-0.5">円</span></p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5 text-center border-t-4 border-t-orange-500">
                <p className="text-xs text-gray-400 mb-1">施術患者数</p>
                <p className="text-3xl font-bold text-orange-600">{uniquePatients}<span className="text-sm font-normal text-gray-400 ml-0.5">人</span></p>
              </div>
            </div>

            {/* 月別目標テーブル（年間表示時のみ） */}
            {period === 'year' && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b">
                  <h3 className="font-bold text-gray-800 text-sm">月別実績・目標</h3>
                  <p className="text-xs text-gray-400 mt-1">目標のセルをクリックして直接入力できます</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-semibold">月</th>
                        <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-semibold">売上実績</th>
                        <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-semibold bg-blue-50">売上目標</th>
                        <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-semibold">達成率</th>
                        <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-semibold">新規実績</th>
                        <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-semibold bg-blue-50">新規目標</th>
                        <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-semibold">達成率</th>
                        <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-semibold">施術数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((d, i) => {
                        const m = i + 1
                        const revPct = d.revenueGoal > 0 ? Math.round(d.revenue / d.revenueGoal * 100) : null
                        const newPct = d.newPatientGoal > 0 ? Math.round(d.newPatients / d.newPatientGoal * 100) : null
                        return (
                          <tr key={d.month} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2.5 font-medium">{m}月</td>
                            <td className="px-3 py-2.5 text-right font-medium">{d.revenue > 0 ? d.revenue.toLocaleString() + '円' : '-'}</td>
                            <td className="px-3 py-2.5 text-right bg-blue-50/50 cursor-pointer hover:bg-blue-100" onClick={() => handleCellClick(`rev-${m}`, d.revenueGoal)}>
                              {editingCell === `rev-${m}` ? (
                                <input type="number" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => handleCellSave(m, 'revenue_goal')}
                                  onKeyDown={e => { if (e.key === 'Enter') handleCellSave(m, 'revenue_goal'); if (e.key === 'Escape') setEditingCell(null) }}
                                  className="w-24 px-2 py-1 border border-blue-400 rounded text-sm text-right focus:outline-none" />
                              ) : (
                                <span className="text-blue-600 text-xs">{d.revenueGoal > 0 ? d.revenueGoal.toLocaleString() + '円' : 'クリックで入力'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {revPct !== null ? <span className={`font-bold text-xs ${pctColor(revPct)}`}>{revPct}%</span> : <span className="text-gray-300">-</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium">{d.newPatients > 0 ? d.newPatients + '人' : '-'}</td>
                            <td className="px-3 py-2.5 text-right bg-blue-50/50 cursor-pointer hover:bg-blue-100" onClick={() => handleCellClick(`new-${m}`, d.newPatientGoal)}>
                              {editingCell === `new-${m}` ? (
                                <input type="number" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => handleCellSave(m, 'new_patient_goal')}
                                  onKeyDown={e => { if (e.key === 'Enter') handleCellSave(m, 'new_patient_goal'); if (e.key === 'Escape') setEditingCell(null) }}
                                  className="w-16 px-2 py-1 border border-blue-400 rounded text-sm text-right focus:outline-none" />
                              ) : (
                                <span className="text-blue-600 text-xs">{d.newPatientGoal > 0 ? d.newPatientGoal + '人' : 'クリックで入力'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {newPct !== null ? <span className={`font-bold text-xs ${pctColor(newPct)}`}>{newPct}%</span> : <span className="text-gray-300">-</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-600">{d.visitCount > 0 ? d.visitCount + '件' : '-'}</td>
                          </tr>
                        )
                      })}
                      {/* 合計行 */}
                      <tr className="bg-gray-50 font-bold border-t-2">
                        <td className="px-3 py-2.5">合計</td>
                        <td className="px-3 py-2.5 text-right">{totalRevenue.toLocaleString()}円</td>
                        <td className="px-3 py-2.5 text-right bg-blue-50/50 text-blue-600">{yearRevenueGoal > 0 ? yearRevenueGoal.toLocaleString() + '円' : '-'}</td>
                        <td className="px-3 py-2.5 text-right">
                          {yearRevenueGoal > 0 ? <span className={pctColor(Math.round(totalRevenue / yearRevenueGoal * 100))}>{Math.round(totalRevenue / yearRevenueGoal * 100)}%</span> : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right">{yearNewPatients}人</td>
                        <td className="px-3 py-2.5 text-right bg-blue-50/50 text-blue-600">{yearNewPatientGoal > 0 ? yearNewPatientGoal + '人' : '-'}</td>
                        <td className="px-3 py-2.5 text-right">
                          {yearNewPatientGoal > 0 ? <span className={pctColor(Math.round(yearNewPatients / yearNewPatientGoal * 100))}>{Math.round(yearNewPatients / yearNewPatientGoal * 100)}%</span> : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right">{slips.length}件</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 患者ステータス */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-gray-800 text-sm mb-3">患者ステータス</h3>
              <div className="flex gap-3">
                <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-green-700">{statusCounts.active}</p>
                  <p className="text-xs text-green-600">通院中</p>
                </div>
                <div className="flex-1 bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-gray-600">{statusCounts.inactive}</p>
                  <p className="text-xs text-gray-500">休止</p>
                </div>
                <div className="flex-1 bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{statusCounts.completed}</p>
                  <p className="text-xs text-blue-600">卒業</p>
                </div>
              </div>
            </div>

            {/* 来院経路 */}
            {referralSorted.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-bold text-gray-800 text-sm mb-3">来院経路</h3>
                <div className="space-y-3">
                  {referralSorted.map(([source, count], idx) => {
                    const colors = ['#14252A', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#795548']
                    const color = colors[idx % colors.length]
                    const pct = Math.round((count / patients.length) * 100)
                    return (
                      <div key={source}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm font-medium text-gray-700">{source}</span>
                          <span className="text-xs font-bold" style={{ color }}>{count}人 ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-3">
                          <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 支払方法別 */}
            {Object.keys(paymentCounts).length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-bold text-gray-800 text-sm mb-3">支払方法</h3>
                <div className="flex gap-2.5 flex-wrap">
                  {Object.entries(paymentCounts).sort((a, b) => b[1] - a[1]).map(([method, count]) => {
                    const icons: Record<string, string> = { '現金': '💴', 'カード': '💳', 'QR決済': '📱', '回数券': '🎫', 'その他': '📦' }
                    return (
                      <div key={method} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center shadow-sm hover:shadow-md transition-shadow min-w-[80px]">
                        <div className="text-xl mb-1">{icons[method] || '💰'}</div>
                        <p className="text-xl font-bold" style={{ color: '#14252A' }}>{count}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{method}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
