'use client'

import { useEffect, useState, useRef } from 'react'
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

interface AdCostRow {
  month: string
  channel: string
  cost: number
  new_patients: number
}

interface MonthlyData {
  month: string
  revenue: number
  visitCount: number
  uniquePatients: number
  frequency: number
  newPatients: number
  repeatPatients: number
  avgPrice: number
  newRevenue: number
  existingRevenue: number
  revenueGoal: number
  newPatientGoal: number
  adCost: number
  roas: number | null
  cpa: number | null
  ltv: number
  profitLtv: number | null
}

export default function StatsPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const [slips, setSlips] = useState<Slip[]>([])
  const [patients, setPatients] = useState<Patient[]>([])
  const [period, setPeriod] = useState('year')
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [goals, setGoals] = useState<MonthlyGoal[]>([])
  const [adCosts, setAdCosts] = useState<AdCostRow[]>([])
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const printRef = useRef<HTMLDivElement>(null)

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
        startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
      } else {
        startDate = selectedYear + '-01-01'
      }

      const [slipsData, patientsRes, goalsRes, adCostsRes] = await Promise.all([
        fetchAllSlips(supabase, '*', { gte: ['visit_date', startDate] }),
        supabase.from('cm_patients').select('*').eq('clinic_id', clinicId),
        supabase.from('cm_monthly_goals').select('*').eq('clinic_id', clinicId).eq('year', selectedYear),
        supabase.from('cm_ad_costs').select('month, channel, cost, new_patients').eq('clinic_id', clinicId).like('month', `${selectedYear}-%`),
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
      setAdCosts((adCostsRes.data || []).map((a: Record<string, unknown>) => ({
        month: a.month as string,
        channel: a.channel as string,
        cost: Number(a.cost) || 0,
        new_patients: Number(a.new_patients) || 0,
      })))
      setLoading(false)
    }
    load()
  }, [period, selectedYear, selectedMonth])

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
  const yearAdCost = adCosts.reduce((sum, a) => sum + a.cost, 0)

  // 年間新規患者数
  const yearNewPatients = patients.filter(p => {
    if (!p.first_visit_date) return false
    return p.first_visit_date.startsWith(String(selectedYear))
  }).length

  // 新規患者IDセット（月別）
  const newPatientIdsByMonth: Record<string, Set<string>> = {}
  patients.forEach(p => {
    if (!p.first_visit_date || !p.id) return
    const m = p.first_visit_date.slice(0, 7)
    if (!m.startsWith(String(selectedYear))) return
    if (!newPatientIdsByMonth[m]) newPatientIdsByMonth[m] = new Set()
    newPatientIdsByMonth[m].add(p.id)
  })

  // 新規患者の全ID（年間）
  const yearNewPatientIds = new Set<string>()
  Object.values(newPatientIdsByMonth).forEach(s => s.forEach(id => yearNewPatientIds.add(id)))

  // 初回来院月を全期間から取得（リピート判定用）
  const firstVisitMonth: Record<string, string> = {}
  slips.forEach(s => {
    if (!s.patient_id) return
    const month = s.visit_date.slice(0, 7)
    if (!firstVisitMonth[s.patient_id] || month < firstVisitMonth[s.patient_id]) {
      firstVisitMonth[s.patient_id] = month
    }
  })

  // 新規患者LTV計算（その患者の年間全施術合計 / 新規数）
  const newPatientRevenue: Record<string, number> = {}
  slips.forEach(s => {
    if (!s.patient_id || !yearNewPatientIds.has(s.patient_id)) return
    newPatientRevenue[s.patient_id] = (newPatientRevenue[s.patient_id] || 0) + (s.total_price || 0)
  })

  // 月別データ集計
  const monthlyData: MonthlyData[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const monthStr = `${selectedYear}-${String(m).padStart(2, '0')}`
    const monthSlips = slips.filter(s => s.visit_date.startsWith(monthStr))
    const revenue = monthSlips.reduce((sum, s) => sum + (s.total_price || 0), 0)
    const newP = patients.filter(p => p.first_visit_date?.startsWith(monthStr)).length
    const uniqueMonthPatients = new Set(monthSlips.map(s => s.patient_id).filter(Boolean))
    const uniqueCount = uniqueMonthPatients.size
    const repeatP = [...uniqueMonthPatients].filter(pid => firstVisitMonth[pid as string] && firstVisitMonth[pid as string] < monthStr).length
    const normalMonth = monthSlips.filter(s => (s.total_price || 0) > 0 && (s.total_price || 0) < 50000)
    const avgP = normalMonth.length > 0 ? Math.round(normalMonth.reduce((s, sl) => s + (sl.total_price || 0), 0) / normalMonth.length) : 0
    const goal = goals.find(g => g.month === m)
    const monthAdCost = adCosts.filter(a => a.month === monthStr).reduce((s, a) => s + a.cost, 0)

    // 新規売上（その月に初来院した患者のその月の施術売上）
    const newIds = newPatientIdsByMonth[monthStr] || new Set()
    const newRev = monthSlips.filter(s => s.patient_id && newIds.has(s.patient_id)).reduce((s, sl) => s + (sl.total_price || 0), 0)
    const existRev = revenue - newRev

    // LTV（その月の新規患者の年間売上合計 / 新規数）
    let ltv = 0
    if (newP > 0) {
      const totalNewPatientRev = [...newIds].reduce((s, pid) => s + (newPatientRevenue[pid] || 0), 0)
      ltv = Math.round(totalNewPatientRev / newP)
    }

    const cpa = monthAdCost > 0 && newP > 0 ? Math.round(monthAdCost / newP) : null
    const profitLtv = cpa !== null && ltv > 0 ? ltv - cpa : null
    const frequency = uniqueCount > 0 ? Math.round(monthSlips.length / uniqueCount * 10) / 10 : 0

    return {
      month: monthStr,
      revenue,
      visitCount: monthSlips.length,
      uniquePatients: uniqueCount,
      frequency,
      newPatients: newP,
      repeatPatients: repeatP,
      avgPrice: avgP,
      newRevenue: newRev,
      existingRevenue: existRev,
      revenueGoal: goal?.revenue_goal || 0,
      newPatientGoal: goal?.new_patient_goal || 0,
      adCost: monthAdCost,
      roas: monthAdCost > 0 ? Math.round(revenue / monthAdCost * 100) : null,
      cpa,
      ltv,
      profitLtv,
    }
  })

  // 年間集計
  const yearTotalUniquePatients = uniquePatients
  const yearTotalNewRevenue = monthlyData.reduce((s, d) => s + d.newRevenue, 0)
  const yearTotalExistingRevenue = monthlyData.reduce((s, d) => s + d.existingRevenue, 0)
  const yearAvgLtv = yearNewPatients > 0 ? Math.round(Object.values(newPatientRevenue).reduce((s, v) => s + v, 0) / yearNewPatients) : 0
  const yearAvgCpa = yearAdCost > 0 && yearNewPatients > 0 ? Math.round(yearAdCost / yearNewPatients) : null
  const yearProfitLtv = yearAvgCpa !== null && yearAvgLtv > 0 ? yearAvgLtv - yearAvgCpa : null

  // 広告媒体別集計
  const channelSummary: Record<string, { cost: number; newPatients: number }> = {}
  adCosts.forEach(a => {
    if (!channelSummary[a.channel]) channelSummary[a.channel] = { cost: 0, newPatients: 0 }
    channelSummary[a.channel].cost += a.cost
    channelSummary[a.channel].newPatients += a.new_patients
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
  const pctBg = (pct: number) => pct >= 100 ? 'bg-green-50 text-green-700' : pct >= 70 ? 'bg-orange-50 text-orange-700' : 'bg-red-50 text-red-700'

  const handlePrint = () => {
    window.print()
  }

  // CSV生成共通関数
  const downloadCsv = (rows: string[][], filename: string) => {
    const BOM = '\uFEFF'
    const csvContent = BOM + rows.map(row =>
      row.map(cell => {
        const str = String(cell)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      }).join(',')
    ).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // 年間スプレッドシート（CSV）出力
  const handleCsvExport = () => {
    const rows: string[][] = []

    rows.push([`${selectedYear}年 年間統計表`])
    rows.push([`出力日: ${new Date().toLocaleDateString('ja-JP')}`])
    rows.push([])

    rows.push([
      '月', '施術回数', 'カルテ枚数', '来院頻度', '新規数', '売上', '売上目標', '達成率',
      '新規売上', '既存売上', '施術単価', '広告費', 'CPA', '新規LTV', '利益LTV', 'ROAS',
      '新規目標', '新規達成率', '備考'
    ])

    monthlyData.forEach((d, i) => {
      const m = i + 1
      const revPct = d.revenueGoal > 0 ? Math.round(d.revenue / d.revenueGoal * 100) : null
      const newPct = d.newPatientGoal > 0 ? Math.round(d.newPatients / d.newPatientGoal * 100) : null
      rows.push([
        `${m}月`, String(d.visitCount || ''), String(d.uniquePatients || ''),
        d.frequency > 0 ? d.frequency.toFixed(1) : '', String(d.newPatients || ''),
        String(d.revenue || ''), String(d.revenueGoal || ''), revPct !== null ? `${revPct}%` : '',
        String(d.newRevenue || ''), String(d.existingRevenue || ''), String(d.avgPrice || ''),
        String(d.adCost || ''), d.cpa !== null ? String(d.cpa) : '',
        d.ltv > 0 ? String(d.ltv) : '', d.profitLtv !== null ? String(d.profitLtv) : '',
        d.roas !== null ? `${d.roas}%` : '', String(d.newPatientGoal || ''),
        newPct !== null ? `${newPct}%` : '', '',
      ])
    })

    const yearFreq = yearTotalUniquePatients > 0 ? (slips.length / yearTotalUniquePatients).toFixed(1) : ''
    rows.push([
      '合計/平均', String(slips.length), String(yearTotalUniquePatients), yearFreq,
      String(yearNewPatients), String(totalRevenue),
      yearRevenueGoal > 0 ? String(yearRevenueGoal) : '',
      yearRevenueGoal > 0 ? `${Math.round(totalRevenue / yearRevenueGoal * 100)}%` : '',
      String(yearTotalNewRevenue || ''), String(yearTotalExistingRevenue || ''),
      String(avgRevenue), yearAdCost > 0 ? String(yearAdCost) : '',
      yearAvgCpa !== null ? String(yearAvgCpa) : '',
      yearAvgLtv > 0 ? String(yearAvgLtv) : '',
      yearProfitLtv !== null ? String(yearProfitLtv) : '',
      yearAdCost > 0 ? `${Math.round(totalRevenue / yearAdCost * 100)}%` : '',
      yearNewPatientGoal > 0 ? String(yearNewPatientGoal) : '',
      yearNewPatientGoal > 0 ? `${Math.round(yearNewPatients / yearNewPatientGoal * 100)}%` : '', '',
    ])

    rows.push([], [])
    // 広告媒体別
    rows.push(['【広告媒体別実績】'])
    rows.push(['媒体', '広告費', '新規数', 'CPA'])
    const chEntries = Object.entries(channelSummary).sort((a, b) => b[1].cost - a[1].cost)
    if (chEntries.length > 0) {
      chEntries.forEach(([ch, data]) => {
        rows.push([ch, String(data.cost), String(data.newPatients), data.newPatients > 0 ? String(Math.round(data.cost / data.newPatients)) : ''])
      })
      rows.push(['合計', String(yearAdCost), '', ''])
    }

    rows.push([], [])
    rows.push(['【患者ステータス】'])
    rows.push(['ステータス', '人数'])
    rows.push(['通院中', String(statusCounts.active)])
    rows.push(['休止', String(statusCounts.inactive)])
    rows.push(['卒業', String(statusCounts.completed)])

    rows.push([], [])
    rows.push(['【来院経路】'])
    rows.push(['経路', '人数', '割合'])
    referralSorted.forEach(([source, count]) => {
      rows.push([source, String(count), `${patients.length > 0 ? Math.round(count / patients.length * 100) : 0}%`])
    })

    downloadCsv(rows, `年間統計表_${selectedYear}年.csv`)
  }

  // 単月スプレッドシート（CSV）出力 - 元スプレッドシート形式
  const handleMonthlyCsvExport = () => {
    const mIdx = selectedMonth - 1
    const d = monthlyData[mIdx]
    const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
    const rows: string[][] = []

    // --- データ準備 ---
    const newIds = newPatientIdsByMonth[monthStr] || new Set()
    const newPList = patients.filter(p => newIds.has(p.id))
    const monthSlips = slips.filter(s => s.visit_date.startsWith(monthStr))

    // 広告媒体別
    const monthChannels: Record<string, { cost: number; newPatients: number }> = {}
    adCosts.filter(a => a.month === monthStr).forEach(a => {
      if (!monthChannels[a.channel]) monthChannels[a.channel] = { cost: 0, newPatients: 0 }
      monthChannels[a.channel].cost += a.cost
      monthChannels[a.channel].newPatients += a.new_patients
    })
    const totalMonthAd = Object.values(monthChannels).reduce((s, c) => s + c.cost, 0)
    const mchEntries = Object.entries(monthChannels).sort((a, b) => b[1].cost - a[1].cost)

    // 既存患者売上
    const existRevMap: Record<string, { name: string; revenue: number; source: string }> = {}
    monthSlips.forEach(s => {
      if (!s.patient_id || newIds.has(s.patient_id)) return
      if (!existRevMap[s.patient_id]) {
        const pat = patients.find(pp => pp.id === s.patient_id)
        existRevMap[s.patient_id] = { name: s.patient_name || pat?.name || '', revenue: 0, source: pat?.referral_source || '' }
      }
      existRevMap[s.patient_id].revenue += (s.total_price || 0)
    })
    const existEntries = Object.values(existRevMap).sort((a, b) => b.revenue - a.revenue)

    // 空セルパディング用
    const e = (cols: number) => Array(cols).fill('')
    // 行を結合（左セクション + 空白 + 右セクション）
    const merge = (left: string[], right: string[], leftWidth = 6) => {
      const padded = [...left, ...e(Math.max(0, leftWidth - left.length)), '', ...right]
      return padded
    }

    // ===========================
    // セクション1: タイトル行
    // ===========================
    // 左: タイトル | 右: 新規患者管理タイトル
    rows.push(merge(
      [`${selectedYear}年${selectedMonth}月 月間統計表`, '', '', '', '', ''],
      ['新規患者管理']
    ))
    rows.push(merge(e(6), e(6)))

    // ===========================
    // セクション2: 左=基本実績 / 右=新規患者リスト（横並び）
    // ===========================
    const leftKpi: string[][] = [
      ['売上', String(d.revenue || 0), '', '売上目標', d.revenueGoal > 0 ? String(d.revenueGoal) : '', ''],
      ['営業日数', '', '', '目標達成率', d.revenueGoal > 0 ? `${Math.round(d.revenue / d.revenueGoal * 100)}%` : '', ''],
      ['施術回数', String(d.visitCount), '', '', '', ''],
      ['予約枠', '', '', '稼働率', '', ''],
      ['カルテ枚数', String(d.uniquePatients), '', '', '', ''],
      ['来院頻度', d.frequency > 0 ? d.frequency.toFixed(1) + '回' : '', '', '', '', ''],
      ['単価', d.avgPrice > 0 ? String(d.avgPrice) : '', '', '分単価', '', ''],
      ['既存売上', String(d.existingRevenue || 0), '', '新規売上', String(d.newRevenue || 0), ''],
      ['新規数合計', String(d.newPatients), '人', '2回目リピ数', '', '人'],
      ['6回目リピ数', '', '人', '2回目リピ率', '', ''],
      ['6回目リピ率', '', '', '回数券購入率', '', ''],
      ['回数券内訳', '', '', '', '', ''],
      ['LTV', d.ltv > 0 ? String(d.ltv) : '', '', '', '', ''],
      ['CPA', d.cpa !== null ? String(d.cpa) : '', '', '', '', ''],
      ['利益LTV', d.profitLtv !== null ? String(d.profitLtv) : '', '', '', '', ''],
    ]

    // 右: 新規患者テーブル
    const rightNewPatients: string[][] = [
      ['問い合わせ氏名', '媒体', 'キーワード', 'CVの有無', '初回施術後', '理由'],
    ]
    if (newPList.length > 0) {
      newPList.forEach(p => {
        rightNewPatients.push([
          p.name,
          p.referral_source || '',
          p.chief_complaint || '',
          '', '', '' // CVの有無・初回施術後・理由は手入力
        ])
      })
    }
    // 空行を追加して左右の行数を揃える
    const maxRows = Math.max(leftKpi.length, rightNewPatients.length)
    while (leftKpi.length < maxRows) leftKpi.push(e(6))
    while (rightNewPatients.length < maxRows) rightNewPatients.push(e(6))

    for (let i = 0; i < maxRows; i++) {
      rows.push(merge(leftKpi[i], rightNewPatients[i]))
    }

    rows.push(merge(e(6), e(6)))

    // ===========================
    // セクション3: 左=広告媒体別 / 右=振り返り
    // ===========================
    const leftAd: string[][] = [
      ['【広告媒体別実績】', '', '', '', '', ''],
      ['媒体', '新規数', '問合せ', 'アクセス', '反応率', 'CV率', '費用', '売上', 'LTV', 'CPA', '利益LTV'],
    ]
    if (mchEntries.length > 0) {
      mchEntries.forEach(([ch, data]) => {
        leftAd.push([
          ch, String(data.newPatients), '', '', '', '',
          String(data.cost), '',
          '', data.newPatients > 0 ? String(Math.round(data.cost / data.newPatients)) : '', ''
        ])
      })
      leftAd.push(['全広告費', '', '', '', '', '', String(totalMonthAd), '', '', '', ''])
    } else {
      leftAd.push(['（広告データなし）', '', '', '', '', '', '', '', '', '', ''])
    }

    // 振り返りは右に配置
    const rightReview: string[][] = [
      ['【振り返り】', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['', '', '', '', '', ''],
    ]
    const maxRows2 = Math.max(leftAd.length, rightReview.length)
    while (leftAd.length < maxRows2) leftAd.push(e(11))
    while (rightReview.length < maxRows2) rightReview.push(e(6))

    // 広告テーブルは11列あるので leftWidth を 11 に
    for (let i = 0; i < maxRows2; i++) {
      const padded = [...leftAd[i], ...e(Math.max(0, 12 - leftAd[i].length)), '', ...rightReview[i]]
      rows.push(padded)
    }

    rows.push(e(13))

    // ===========================
    // セクション4: 左=既存患者売上 / 右=固定費・損益
    // ===========================
    const leftExist: string[][] = [
      ['【既存患者売上一覧】', '', '', '', '', ''],
      ['氏名', '媒体', '金額', '', '', ''],
    ]
    if (existEntries.length > 0) {
      existEntries.forEach(ex => {
        leftExist.push([ex.name, ex.source, String(ex.revenue), '', '', ''])
      })
      leftExist.push(['合計', '', String(d.existingRevenue), '', '', ''])
    } else {
      leftExist.push(['（既存患者なし）', '', '', '', '', ''])
    }

    const rightCost: string[][] = [
      ['【固定費・損益】', '', '', '', '', ''],
      ['項目', '金額', '', '', '', ''],
      ['家賃', '', '', '', '', ''],
      ['水道光熱費・通信費', '', '', '', '', ''],
      ['セミナー・移動費', '', '', '', '', ''],
      ['分割支払い', '', '', '', '', ''],
      ['雑費', '', '', '', '', ''],
      ['固定費合計', '', '', '', '', ''],
      ['広告費', String(totalMonthAd || ''), '', '', '', ''],
      ['純利益', '', '', '', '', ''],
    ]

    const maxRows3 = Math.max(leftExist.length, rightCost.length)
    while (leftExist.length < maxRows3) leftExist.push(e(6))
    while (rightCost.length < maxRows3) rightCost.push(e(6))

    for (let i = 0; i < maxRows3; i++) {
      rows.push(merge(leftExist[i], rightCost[i]))
    }

    rows.push(e(13))
    rows.push(e(13))

    // ===========================
    // セクション5: 年間サマリーテーブル
    // ===========================
    rows.push(['【年間サマリー】'])
    rows.push([
      '月', '施術回数', 'カルテ枚数', '頻度', '新規数', '売上', '新規売上', '既存売上',
      '広告費', '新規LTV', 'CPA', '利益LTV'
    ])
    monthlyData.forEach((md, i) => {
      rows.push([
        `${i + 1}月`, String(md.visitCount || ''), String(md.uniquePatients || ''),
        md.frequency > 0 ? md.frequency.toFixed(1) : '', String(md.newPatients || ''),
        String(md.revenue || ''), String(md.newRevenue || ''), String(md.existingRevenue || ''),
        String(md.adCost || ''), md.ltv > 0 ? String(md.ltv) : '',
        md.cpa !== null ? String(md.cpa) : '', md.profitLtv !== null ? String(md.profitLtv) : '',
      ])
    })
    const yFreq = yearTotalUniquePatients > 0 ? (slips.length / yearTotalUniquePatients).toFixed(1) : ''
    rows.push([
      '合計', String(slips.length), String(yearTotalUniquePatients), yFreq,
      String(yearNewPatients), String(totalRevenue), String(yearTotalNewRevenue || ''),
      String(yearTotalExistingRevenue || ''), yearAdCost > 0 ? String(yearAdCost) : '',
      yearAvgLtv > 0 ? String(yearAvgLtv) : '', yearAvgCpa !== null ? String(yearAvgCpa) : '',
      yearProfitLtv !== null ? String(yearProfitLtv) : '',
    ])

    rows.push(e(12))

    // ===========================
    // セクション6: 年間KPIサマリー
    // ===========================
    rows.push(['【年間KPIサマリー】'])
    rows.push(['累計売上', String(totalRevenue), '', '総施術回数', String(slips.length)])
    rows.push(['総カルテ枚数', String(yearTotalUniquePatients), '', '総広告費', yearAdCost > 0 ? String(yearAdCost) : ''])
    rows.push(['年間平均LTV', yearAvgLtv > 0 ? String(yearAvgLtv) : '', '', '年間平均CPA', yearAvgCpa !== null ? String(yearAvgCpa) : ''])
    rows.push(['平均利益LTV', yearProfitLtv !== null ? String(yearProfitLtv) : '', '', '平均施術単価', String(avgRevenue)])

    downloadCsv(rows, `月間統計表_${selectedYear}年${selectedMonth}月.csv`)
  }

  return (
    <AppShell>
      <Header title="統計" />
      <style>{`
        @media print {
          nav, header, .no-print, .fixed, .screen-only { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px !important; }
          .print-only { display: block !important; }
          .print-container { padding: 10mm !important; max-width: 100% !important; }
          @page { size: A4 landscape; margin: 8mm; }
          .print-title { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
          .print-subtitle { font-size: 11px; color: #666; margin-bottom: 16px; }
          .print-table { width: 100%; border-collapse: collapse; font-size: 8.5px !important; }
          .print-table th { background: #f3f4f6 !important; border: 1px solid #d1d5db; padding: 4px 5px !important; text-align: center; font-weight: 600; white-space: nowrap; }
          .print-table td { border: 1px solid #d1d5db; padding: 3px 5px !important; text-align: right; white-space: nowrap; }
          .print-table .row-total { background: #e5e7eb !important; font-weight: 700; }
          .print-table .col-goal { background: #eff6ff !important; }
          .print-table .col-header-goal { background: #dbeafe !important; }
          .print-summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
          .print-summary-box { border: 1px solid #d1d5db; padding: 10px; }
          .print-summary-box h4 { font-size: 11px; font-weight: 700; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
          .print-summary-row { display: flex; justify-content: space-between; font-size: 9px; padding: 2px 0; }
          .print-summary-row span:last-child { font-weight: 600; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="px-4 py-4 max-w-6xl mx-auto space-y-4 print-container" ref={printRef}>

        {/* 期間選択 */}
        <div className="no-print space-y-3">
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex gap-2">
              {[
                { key: 'month', label: '月別' },
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
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              {years.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
            {period === 'month' && (
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={period === 'year' ? handleCsvExport : handleMonthlyCsvExport}
              className="flex-1 px-4 py-3 bg-[#14252A] text-white rounded-xl text-sm font-bold shadow-sm hover:opacity-90 transition-opacity">
              {period === 'year' ? `${selectedYear}年 年間CSV出力` : `${selectedYear}年${selectedMonth}月 CSV出力`}
            </button>
            <button onClick={handlePrint}
              className="px-4 py-3 border-2 border-gray-300 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors">
              印刷
            </button>
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3 py-4" role="status" aria-label="読み込み中"><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /><div className="h-12 bg-gray-100 rounded-lg" /></div>
        ) : (
          <>
            {/* ==================== 印刷用レイアウト ==================== */}
            {period === 'year' && (
              <div className="print-only">
                <div className="print-title">{selectedYear}年 月間統計表</div>
                <div className="print-subtitle">出力日: {new Date().toLocaleDateString('ja-JP')}</div>

                {/* メイン年間サマリーテーブル */}
                <table className="print-table">
                  <thead>
                    <tr>
                      <th>月</th>
                      <th>施術回数</th>
                      <th>カルテ枚数</th>
                      <th>頻度</th>
                      <th>新規数</th>
                      <th>売上</th>
                      <th className="col-header-goal">売上目標</th>
                      <th>達成率</th>
                      <th>新規売上</th>
                      <th>既存売上</th>
                      <th>単価</th>
                      <th>広告費</th>
                      <th>CPA</th>
                      <th>新規LTV</th>
                      <th>利益LTV</th>
                      <th>ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((d, i) => {
                      const m = i + 1
                      const revPct = d.revenueGoal > 0 ? Math.round(d.revenue / d.revenueGoal * 100) : null
                      return (
                        <tr key={d.month}>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{m}月</td>
                          <td>{d.visitCount > 0 ? d.visitCount : '-'}</td>
                          <td>{d.uniquePatients > 0 ? d.uniquePatients : '-'}</td>
                          <td>{d.frequency > 0 ? d.frequency.toFixed(1) : '-'}</td>
                          <td>{d.newPatients > 0 ? d.newPatients : '-'}</td>
                          <td style={{ fontWeight: 600 }}>{d.revenue > 0 ? d.revenue.toLocaleString() : '-'}</td>
                          <td className="col-goal">{d.revenueGoal > 0 ? d.revenueGoal.toLocaleString() : '-'}</td>
                          <td>{revPct !== null ? `${revPct}%` : '-'}</td>
                          <td>{d.newRevenue > 0 ? d.newRevenue.toLocaleString() : '-'}</td>
                          <td>{d.existingRevenue > 0 ? d.existingRevenue.toLocaleString() : '-'}</td>
                          <td>{d.avgPrice > 0 ? d.avgPrice.toLocaleString() : '-'}</td>
                          <td>{d.adCost > 0 ? d.adCost.toLocaleString() : '-'}</td>
                          <td>{d.cpa !== null ? d.cpa.toLocaleString() : '-'}</td>
                          <td>{d.ltv > 0 ? d.ltv.toLocaleString() : '-'}</td>
                          <td>{d.profitLtv !== null ? d.profitLtv.toLocaleString() : '-'}</td>
                          <td>{d.roas !== null ? `${d.roas}%` : '-'}</td>
                        </tr>
                      )
                    })}
                    <tr className="row-total">
                      <td style={{ textAlign: 'center' }}>合計/平均</td>
                      <td>{slips.length}</td>
                      <td>{yearTotalUniquePatients}</td>
                      <td>{yearTotalUniquePatients > 0 ? (slips.length / yearTotalUniquePatients).toFixed(1) : '-'}</td>
                      <td>{yearNewPatients}</td>
                      <td>{totalRevenue.toLocaleString()}</td>
                      <td className="col-goal">{yearRevenueGoal > 0 ? yearRevenueGoal.toLocaleString() : '-'}</td>
                      <td>{yearRevenueGoal > 0 ? `${Math.round(totalRevenue / yearRevenueGoal * 100)}%` : '-'}</td>
                      <td>{yearTotalNewRevenue > 0 ? yearTotalNewRevenue.toLocaleString() : '-'}</td>
                      <td>{yearTotalExistingRevenue > 0 ? yearTotalExistingRevenue.toLocaleString() : '-'}</td>
                      <td>{avgRevenue > 0 ? avgRevenue.toLocaleString() : '-'}</td>
                      <td>{yearAdCost > 0 ? yearAdCost.toLocaleString() : '-'}</td>
                      <td>{yearAvgCpa !== null ? yearAvgCpa.toLocaleString() : '-'}</td>
                      <td>{yearAvgLtv > 0 ? yearAvgLtv.toLocaleString() : '-'}</td>
                      <td>{yearProfitLtv !== null ? yearProfitLtv.toLocaleString() : '-'}</td>
                      <td>{yearAdCost > 0 ? `${Math.round(totalRevenue / yearAdCost * 100)}%` : '-'}</td>
                    </tr>
                  </tbody>
                </table>

                {/* 下部サマリー */}
                <div className="print-summary-grid">
                  {/* 年間KPIサマリー */}
                  <div className="print-summary-box">
                    <h4>{selectedYear}年 年間KPIサマリー</h4>
                    <div className="print-summary-row"><span>累計売上</span><span>{totalRevenue.toLocaleString()}円</span></div>
                    <div className="print-summary-row"><span>総カルテ枚数</span><span>{yearTotalUniquePatients}人</span></div>
                    <div className="print-summary-row"><span>総施術回数</span><span>{slips.length}回</span></div>
                    <div className="print-summary-row"><span>平均施術単価</span><span>{avgRevenue.toLocaleString()}円</span></div>
                    <div className="print-summary-row"><span>新規患者数</span><span>{yearNewPatients}人</span></div>
                    <div className="print-summary-row"><span>年間平均LTV</span><span>{yearAvgLtv > 0 ? yearAvgLtv.toLocaleString() + '円' : '-'}</span></div>
                    <div className="print-summary-row"><span>総広告費</span><span>{yearAdCost > 0 ? yearAdCost.toLocaleString() + '円' : '-'}</span></div>
                    <div className="print-summary-row"><span>年間平均CPA</span><span>{yearAvgCpa !== null ? yearAvgCpa.toLocaleString() + '円' : '-'}</span></div>
                    <div className="print-summary-row"><span>平均利益LTV</span><span>{yearProfitLtv !== null ? yearProfitLtv.toLocaleString() + '円' : '-'}</span></div>
                  </div>

                  {/* 広告媒体別 */}
                  <div className="print-summary-box">
                    <h4>広告媒体別実績</h4>
                    {Object.keys(channelSummary).length > 0 ? (
                      <>
                        {Object.entries(channelSummary).sort((a, b) => b[1].cost - a[1].cost).map(([ch, data]) => (
                          <div key={ch} className="print-summary-row">
                            <span>{ch}</span>
                            <span>費用: {data.cost.toLocaleString()}円 / 新規: {data.newPatients}人{data.newPatients > 0 ? ` / CPA: ${Math.round(data.cost / data.newPatients).toLocaleString()}円` : ''}</span>
                          </div>
                        ))}
                        <div className="print-summary-row" style={{ borderTop: '1px solid #e5e7eb', marginTop: 4, paddingTop: 4, fontWeight: 700 }}>
                          <span>合計</span>
                          <span>{yearAdCost.toLocaleString()}円</span>
                        </div>
                      </>
                    ) : (
                      <div className="print-summary-row"><span>データなし</span><span>-</span></div>
                    )}
                  </div>

                  {/* 患者ステータス */}
                  <div className="print-summary-box">
                    <h4>患者ステータス</h4>
                    <div className="print-summary-row"><span>通院中</span><span>{statusCounts.active}人</span></div>
                    <div className="print-summary-row"><span>休止</span><span>{statusCounts.inactive}人</span></div>
                    <div className="print-summary-row"><span>卒業</span><span>{statusCounts.completed}人</span></div>
                    <div className="print-summary-row" style={{ borderTop: '1px solid #e5e7eb', marginTop: 4, paddingTop: 4, fontWeight: 700 }}>
                      <span>合計</span><span>{statusCounts.active + statusCounts.inactive + statusCounts.completed}人</span>
                    </div>
                  </div>

                  {/* 来院経路 */}
                  <div className="print-summary-box">
                    <h4>来院経路</h4>
                    {referralSorted.slice(0, 8).map(([source, count]) => (
                      <div key={source} className="print-summary-row">
                        <span>{source}</span>
                        <span>{count}人 ({Math.round(count / patients.length * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== 画面用レイアウト ==================== */}
            {/* 年間目標サマリー */}
            {period === 'year' && (
              <div className="bg-gradient-to-r from-[#14252A] to-[#1e3a42] rounded-xl shadow-lg p-5 text-white screen-only">
                <h3 className="text-sm font-bold mb-4 opacity-80">{selectedYear}年 目標と実績</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs opacity-60 mb-1">年間売上</p>
                    <p className="text-xl sm:text-2xl font-bold">{totalRevenue.toLocaleString()}<span className="text-xs sm:text-sm font-normal opacity-60 ml-1">円</span></p>
                    {yearRevenueGoal > 0 && (
                      <>
                        <p className="text-xs opacity-60 mt-1">目標: {yearRevenueGoal.toLocaleString()}円</p>
                        <div className="w-full bg-white/20 rounded-full h-2 mt-2">
                          <div className="h-2 rounded-full bg-green-400 transition-all" style={{ width: `${Math.min(100, Math.round(totalRevenue / yearRevenueGoal * 100))}%` }} />
                        </div>
                        <p className="text-xs mt-1 font-bold">{Math.round(totalRevenue / yearRevenueGoal * 100)}%</p>
                      </>
                    )}
                  </div>
                  <div>
                    <p className="text-xs opacity-60 mb-1">年間新規</p>
                    <p className="text-xl sm:text-2xl font-bold">{yearNewPatients}<span className="text-xs sm:text-sm font-normal opacity-60 ml-1">人</span></p>
                    {yearNewPatientGoal > 0 && (
                      <>
                        <p className="text-xs opacity-60 mt-1">目標: {yearNewPatientGoal}人</p>
                        <div className="w-full bg-white/20 rounded-full h-2 mt-2">
                          <div className="h-2 rounded-full bg-blue-400 transition-all" style={{ width: `${Math.min(100, Math.round(yearNewPatients / yearNewPatientGoal * 100))}%` }} />
                        </div>
                        <p className="text-xs mt-1 font-bold">{Math.round(yearNewPatients / yearNewPatientGoal * 100)}%</p>
                      </>
                    )}
                  </div>
                  <div>
                    <p className="text-xs opacity-60 mb-1">年間広告費</p>
                    <p className="text-xl sm:text-2xl font-bold">{yearAdCost.toLocaleString()}<span className="text-xs sm:text-sm font-normal opacity-60 ml-1">円</span></p>
                    {yearAdCost > 0 && (
                      <p className="text-xs opacity-60 mt-1">ROAS: {Math.round(totalRevenue / yearAdCost * 100)}%</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs opacity-60 mb-1">施術単価</p>
                    <p className="text-xl sm:text-2xl font-bold">{avgRevenue.toLocaleString()}<span className="text-xs sm:text-sm font-normal opacity-60 ml-1">円</span></p>
                    <p className="text-xs opacity-60 mt-1">施術数: {slips.length}件</p>
                  </div>
                </div>
              </div>
            )}

            {/* メイン指標 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 screen-only">
              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5 text-center border-t-4" style={{ borderTopColor: '#14252A' }}>
                <p className="text-xs text-gray-400 mb-1">売上合計</p>
                <p className="text-2xl sm:text-3xl font-bold" style={{ color: '#14252A' }}>{totalRevenue.toLocaleString()}<span className="text-xs sm:text-sm font-normal text-gray-400 ml-0.5">円</span></p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5 text-center border-t-4 border-t-blue-500">
                <p className="text-xs text-gray-400 mb-1">施術件数</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-600">{slips.length}<span className="text-xs sm:text-sm font-normal text-gray-400 ml-0.5">件</span></p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5 text-center border-t-4 border-t-green-500">
                <p className="text-xs text-gray-400 mb-1">施術単価</p>
                <p className="text-2xl sm:text-3xl font-bold text-green-600">{avgRevenue.toLocaleString()}<span className="text-xs sm:text-sm font-normal text-gray-400 ml-0.5">円</span></p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 sm:p-5 text-center border-t-4 border-t-orange-500">
                <p className="text-xs text-gray-400 mb-1">施術患者数</p>
                <p className="text-2xl sm:text-3xl font-bold text-orange-600">{uniquePatients}<span className="text-xs sm:text-sm font-normal text-gray-400 ml-0.5">人</span></p>
              </div>
            </div>

            {/* 月別統計テーブル（年間表示時のみ） */}
            {period === 'year' && (
              <div className="bg-white rounded-xl shadow-sm overflow-hidden screen-only">
                <div className="p-4 border-b flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-gray-800 text-sm">{selectedYear}年 月別実績・目標</h3>
                    <p className="text-xs text-gray-400 mt-1 no-print">目標のセルをクリックして直接入力できます</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="text-left px-3 py-2 text-xs text-gray-500 font-semibold sticky left-0 bg-gray-50 z-10">月</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">売上実績</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold bg-blue-50">売上目標</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">達成率</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">施術数</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">カルテ</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">頻度</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">単価</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">新規</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold bg-blue-50">新規目標</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">新規売上</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">既存売上</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">広告費</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">CPA</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">LTV</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">利益LTV</th>
                        <th className="text-right px-2 py-2 text-xs text-gray-500 font-semibold">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((d, i) => {
                        const m = i + 1
                        const revPct = d.revenueGoal > 0 ? Math.round(d.revenue / d.revenueGoal * 100) : null
                        return (
                          <tr key={d.month} className="border-b hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium sticky left-0 bg-white z-10">{m}月</td>
                            <td className="px-2 py-2 text-right font-medium">{d.revenue > 0 ? d.revenue.toLocaleString() : '-'}</td>
                            <td className="px-2 py-2 text-right bg-blue-50/50 cursor-pointer hover:bg-blue-100" onClick={() => handleCellClick(`rev-${m}`, d.revenueGoal)}>
                              {editingCell === `rev-${m}` ? (
                                <input type="number" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => handleCellSave(m, 'revenue_goal')}
                                  onKeyDown={e => { if (e.key === 'Enter') handleCellSave(m, 'revenue_goal'); if (e.key === 'Escape') setEditingCell(null) }}
                                  className="w-20 px-1 py-0.5 border border-blue-400 rounded text-sm text-right focus:outline-none" />
                              ) : (
                                <span className="text-blue-600 text-xs">{d.revenueGoal > 0 ? d.revenueGoal.toLocaleString() : '-'}</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {revPct !== null ? <span className={`font-bold text-xs px-1.5 py-0.5 rounded ${pctBg(revPct)}`}>{revPct}%</span> : <span className="text-gray-300">-</span>}
                            </td>
                            <td className="px-2 py-2 text-right">{d.visitCount > 0 ? d.visitCount : '-'}</td>
                            <td className="px-2 py-2 text-right">{d.uniquePatients > 0 ? d.uniquePatients : '-'}</td>
                            <td className="px-2 py-2 text-right text-gray-500">{d.frequency > 0 ? d.frequency.toFixed(1) : '-'}</td>
                            <td className="px-2 py-2 text-right text-gray-600">{d.avgPrice > 0 ? d.avgPrice.toLocaleString() : '-'}</td>
                            <td className="px-2 py-2 text-right font-medium text-blue-600">{d.newPatients > 0 ? d.newPatients : '-'}</td>
                            <td className="px-2 py-2 text-right bg-blue-50/50 cursor-pointer hover:bg-blue-100" onClick={() => handleCellClick(`new-${m}`, d.newPatientGoal)}>
                              {editingCell === `new-${m}` ? (
                                <input type="number" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                                  onBlur={() => handleCellSave(m, 'new_patient_goal')}
                                  onKeyDown={e => { if (e.key === 'Enter') handleCellSave(m, 'new_patient_goal'); if (e.key === 'Escape') setEditingCell(null) }}
                                  className="w-14 px-1 py-0.5 border border-blue-400 rounded text-sm text-right focus:outline-none" />
                              ) : (
                                <span className="text-blue-600 text-xs">{d.newPatientGoal > 0 ? d.newPatientGoal : '-'}</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right text-orange-600">{d.newRevenue > 0 ? d.newRevenue.toLocaleString() : '-'}</td>
                            <td className="px-2 py-2 text-right text-green-600">{d.existingRevenue > 0 ? d.existingRevenue.toLocaleString() : '-'}</td>
                            <td className="px-2 py-2 text-right text-red-500">{d.adCost > 0 ? d.adCost.toLocaleString() : '-'}</td>
                            <td className="px-2 py-2 text-right">{d.cpa !== null ? d.cpa.toLocaleString() : <span className="text-gray-300">-</span>}</td>
                            <td className="px-2 py-2 text-right font-medium">{d.ltv > 0 ? d.ltv.toLocaleString() : <span className="text-gray-300">-</span>}</td>
                            <td className="px-2 py-2 text-right">{d.profitLtv !== null ? <span className={d.profitLtv > 0 ? 'text-green-600 font-medium' : 'text-red-500'}>{d.profitLtv.toLocaleString()}</span> : <span className="text-gray-300">-</span>}</td>
                            <td className="px-2 py-2 text-right">
                              {d.roas !== null ? <span className={`text-xs font-bold ${d.roas >= 300 ? 'text-green-600' : d.roas >= 100 ? 'text-orange-600' : 'text-red-500'}`}>{d.roas}%</span> : <span className="text-gray-300">-</span>}
                            </td>
                          </tr>
                        )
                      })}
                      {/* 合計行 */}
                      <tr className="bg-gray-100 font-bold border-t-2">
                        <td className="px-3 py-2.5 sticky left-0 bg-gray-100 z-10">合計</td>
                        <td className="px-2 py-2.5 text-right">{totalRevenue.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right text-blue-600">{yearRevenueGoal > 0 ? yearRevenueGoal.toLocaleString() : '-'}</td>
                        <td className="px-2 py-2.5 text-right">
                          {yearRevenueGoal > 0 ? <span className={pctColor(Math.round(totalRevenue / yearRevenueGoal * 100))}>{Math.round(totalRevenue / yearRevenueGoal * 100)}%</span> : '-'}
                        </td>
                        <td className="px-2 py-2.5 text-right">{slips.length}</td>
                        <td className="px-2 py-2.5 text-right">{yearTotalUniquePatients}</td>
                        <td className="px-2 py-2.5 text-right text-gray-500">{yearTotalUniquePatients > 0 ? (slips.length / yearTotalUniquePatients).toFixed(1) : '-'}</td>
                        <td className="px-2 py-2.5 text-right text-gray-600">{avgRevenue.toLocaleString()}</td>
                        <td className="px-2 py-2.5 text-right text-blue-600">{yearNewPatients}</td>
                        <td className="px-2 py-2.5 text-right text-blue-600">{yearNewPatientGoal > 0 ? yearNewPatientGoal : '-'}</td>
                        <td className="px-2 py-2.5 text-right text-orange-600">{yearTotalNewRevenue > 0 ? yearTotalNewRevenue.toLocaleString() : '-'}</td>
                        <td className="px-2 py-2.5 text-right text-green-600">{yearTotalExistingRevenue > 0 ? yearTotalExistingRevenue.toLocaleString() : '-'}</td>
                        <td className="px-2 py-2.5 text-right text-red-500">{yearAdCost > 0 ? yearAdCost.toLocaleString() : '-'}</td>
                        <td className="px-2 py-2.5 text-right">{yearAvgCpa !== null ? yearAvgCpa.toLocaleString() : '-'}</td>
                        <td className="px-2 py-2.5 text-right">{yearAvgLtv > 0 ? yearAvgLtv.toLocaleString() : '-'}</td>
                        <td className="px-2 py-2.5 text-right">{yearProfitLtv !== null ? <span className={yearProfitLtv > 0 ? 'text-green-600' : 'text-red-500'}>{yearProfitLtv.toLocaleString()}</span> : '-'}</td>
                        <td className="px-2 py-2.5 text-right">
                          {yearAdCost > 0 ? <span className={`font-bold ${Math.round(totalRevenue / yearAdCost * 100) >= 300 ? 'text-green-600' : 'text-orange-600'}`}>{Math.round(totalRevenue / yearAdCost * 100)}%</span> : '-'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 患者ステータス */}
            <div className="bg-white rounded-xl shadow-sm p-4 screen-only">
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
              <div className="bg-white rounded-xl shadow-sm p-4 screen-only">
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
              <div className="bg-white rounded-xl shadow-sm p-4 screen-only">
                <h3 className="font-bold text-gray-800 text-sm mb-3">支払方法</h3>
                <div className="flex gap-2.5 flex-wrap">
                  {Object.entries(paymentCounts).sort((a, b) => b[1] - a[1]).map(([method, count]) => {
                    const icons: Record<string, string> = { '現金': '💴', 'クレジットカード': '💳', '電子マネー': '📱', '銀行振込': '🏦', 'その他': '📦' }
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
