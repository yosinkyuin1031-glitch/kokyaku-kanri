import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()))
    const month = url.searchParams.get('month') ? parseInt(url.searchParams.get('month')!) : null
    const clinicId = url.searchParams.get('clinic_id') || ''

    if (!clinicId) return NextResponse.json({ error: 'clinic_id required' }, { status: 400 })

    const supabase = await createClient()
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`

    const [slipsRes, patientsRes, goalsRes, adCostsRes] = await Promise.all([
      supabase.from('cm_slips').select('*').eq('clinic_id', clinicId).gte('visit_date', startDate).lte('visit_date', endDate).order('visit_date'),
      supabase.from('cm_patients').select('*').eq('clinic_id', clinicId),
      supabase.from('cm_monthly_goals').select('*').eq('clinic_id', clinicId).eq('year', year),
      supabase.from('cm_ad_costs').select('*').eq('clinic_id', clinicId).like('month', `${year}-%`),
    ])

    const slips = slipsRes.data || []
    const patients = patientsRes.data || []
    const goals = (goalsRes.data || []).map((g: Record<string, unknown>) => ({
      month: Number(g.month), revenue_goal: Number(g.revenue_goal) || 0, new_patient_goal: Number(g.new_patient_goal) || 0,
    }))
    const adCosts = (adCostsRes.data || []).map((a: Record<string, unknown>) => ({
      month: a.month as string, channel: a.channel as string, cost: Number(a.cost) || 0, new_patients: Number(a.new_patients) || 0,
    }))

    // 新規患者IDマップ
    const newPatientIdsByMonth: Record<string, Set<string>> = {}
    patients.forEach((p: Record<string, unknown>) => {
      const fv = p.first_visit_date as string
      if (!fv || !p.id) return
      const m = fv.slice(0, 7)
      if (!m.startsWith(String(year))) return
      if (!newPatientIdsByMonth[m]) newPatientIdsByMonth[m] = new Set()
      newPatientIdsByMonth[m].add(p.id as string)
    })
    const allNewIds = new Set<string>()
    Object.values(newPatientIdsByMonth).forEach(s => s.forEach(id => allNewIds.add(id)))

    // 新規患者の年間売上
    const newPatientRevMap: Record<string, number> = {}
    slips.forEach((s: Record<string, unknown>) => {
      const pid = s.patient_id as string
      if (!pid || !allNewIds.has(pid)) return
      newPatientRevMap[pid] = (newPatientRevMap[pid] || 0) + (Number(s.total_price) || 0)
    })

    // 月別データ
    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const ms = `${year}-${String(m).padStart(2, '0')}`
      const mSlips = slips.filter((s: Record<string, unknown>) => (s.visit_date as string).startsWith(ms))
      const revenue = mSlips.reduce((s: number, sl: Record<string, unknown>) => s + (Number(sl.total_price) || 0), 0)
      const newP = patients.filter((p: Record<string, unknown>) => (p.first_visit_date as string)?.startsWith(ms)).length
      const uniqueIds = new Set(mSlips.map((s: Record<string, unknown>) => s.patient_id).filter(Boolean))
      const uniqueCount = uniqueIds.size
      const newIds = newPatientIdsByMonth[ms] || new Set()
      const newRev = mSlips.filter((s: Record<string, unknown>) => newIds.has(s.patient_id as string)).reduce((s: number, sl: Record<string, unknown>) => s + (Number(sl.total_price) || 0), 0)
      const existRev = revenue - newRev
      const normal = mSlips.filter((s: Record<string, unknown>) => (Number(s.total_price) || 0) > 0 && (Number(s.total_price) || 0) < 50000)
      const avgP = normal.length > 0 ? Math.round(normal.reduce((s: number, sl: Record<string, unknown>) => s + (Number(sl.total_price) || 0), 0) / normal.length) : 0
      const goal = goals.find((g: { month: number }) => g.month === m)
      const mAdCost = adCosts.filter(a => a.month === ms).reduce((s, a) => s + a.cost, 0)
      let ltv = 0
      if (newP > 0) {
        ltv = Math.round([...newIds].reduce((s, pid) => s + (newPatientRevMap[pid] || 0), 0) / newP)
      }
      const cpa = mAdCost > 0 && newP > 0 ? Math.round(mAdCost / newP) : null
      return {
        m, ms, revenue, visitCount: mSlips.length, uniqueCount, newP, newRev, existRev, avgP,
        frequency: uniqueCount > 0 ? Math.round(mSlips.length / uniqueCount * 10) / 10 : 0,
        revenueGoal: goal?.revenue_goal || 0, newPatientGoal: goal?.new_patient_goal || 0,
        adCost: mAdCost, cpa, ltv, profitLtv: cpa !== null && ltv > 0 ? ltv - cpa : null,
        roas: mAdCost > 0 ? Math.round(revenue / mAdCost * 100) : null,
      }
    })

    // Excel生成
    const wb = new ExcelJS.Workbook()

    // スタイル定義
    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14252A' } }
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    const subHeaderFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
    const subHeaderFont: Partial<ExcelJS.Font> = { bold: true, size: 9 }
    const borderThin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFD1D5DB' } }
    const borders: Partial<ExcelJS.Borders> = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin }
    const numFmt = '#,##0'
    const pctFmt = '0%'

    const applyHeader = (cell: ExcelJS.Cell) => {
      cell.fill = headerFill; cell.font = headerFont; cell.border = borders; cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
    const applySubHeader = (cell: ExcelJS.Cell) => {
      cell.fill = subHeaderFill; cell.font = subHeaderFont; cell.border = borders; cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
    const applyCell = (cell: ExcelJS.Cell, isNum = false) => {
      cell.border = borders
      cell.alignment = { horizontal: isNum ? 'right' : 'left', vertical: 'middle' }
      if (isNum) cell.numFmt = numFmt
    }
    const applyTotal = (cell: ExcelJS.Cell, isNum = false) => {
      cell.border = borders; cell.font = { bold: true, size: 9 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
      cell.alignment = { horizontal: isNum ? 'right' : 'left', vertical: 'middle' }
      if (isNum) cell.numFmt = numFmt
    }

    // ======= 単月シート =======
    const generateMonthSheet = (targetMonth: number) => {
      const md = monthlyData[targetMonth - 1]
      const ms = md.ms
      const ws = wb.addWorksheet(`${targetMonth}月`)
      ws.properties.defaultRowHeight = 18

      // 列幅設定
      const colWidths = [14, 12, 12, 10, 10, 10, '', 14, 12, 14, 10, 12, 14]
      colWidths.forEach((w, i) => { if (w) ws.getColumn(i + 1).width = Number(w) })

      // タイトル
      let r = 1
      ws.mergeCells(r, 1, r, 6)
      const titleCell = ws.getCell(r, 1)
      titleCell.value = `${year}年${targetMonth}月 月間統計表`
      titleCell.font = { bold: true, size: 14 }
      ws.mergeCells(r, 8, r, 13)
      const rtitle = ws.getCell(r, 8)
      rtitle.value = '新規患者管理'
      rtitle.font = { bold: true, size: 12 }
      r += 2

      // 左: 基本実績
      const kpiLabels: [string, string | number][] = [
        ['売上', md.revenue], ['売上目標', md.revenueGoal || ''],
        ['達成率', md.revenueGoal > 0 ? `${Math.round(md.revenue / md.revenueGoal * 100)}%` : ''],
        ['営業日数', ''], ['施術回数', md.visitCount],
        ['予約枠', ''], ['稼働率', ''],
        ['カルテ枚数', md.uniqueCount], ['来院頻度', md.frequency > 0 ? `${md.frequency}回` : ''],
        ['単価', md.avgP], ['分単価', ''],
        ['既存売上', md.existRev], ['新規売上', md.newRev],
        ['新規数合計', `${md.newP}人`],
        ['2回目リピ数', ''], ['6回目リピ数', ''],
        ['2回目リピ率', ''], ['6回目リピ率', ''],
        ['回数券購入率', ''], ['回数券内訳', ''],
        ['LTV', md.ltv || ''], ['CPA', md.cpa || ''], ['利益LTV', md.profitLtv || ''],
      ]

      // 右: 新規患者リスト
      const newIds = newPatientIdsByMonth[ms] || new Set()
      const newPList = patients.filter((p: Record<string, unknown>) => newIds.has(p.id as string))
      const rightHeaders = ['氏名', '媒体', 'キーワード', 'CVの有無', '初回施術後', '理由']

      // 右ヘッダー
      rightHeaders.forEach((h, ci) => { const c = ws.getCell(r, 8 + ci); c.value = h; applySubHeader(c) })

      // KPI + 新規患者を並行して書き込み
      const maxKpiRows = Math.max(kpiLabels.length, newPList.length + 1)
      for (let i = 0; i < maxKpiRows; i++) {
        const row = r + i + 1
        if (i < kpiLabels.length) {
          const lbl = ws.getCell(row, 1); lbl.value = kpiLabels[i][0]; applySubHeader(lbl)
          const val = ws.getCell(row, 2)
          val.value = kpiLabels[i][1] === '' ? '' : kpiLabels[i][1]
          applyCell(val, typeof kpiLabels[i][1] === 'number')
          ws.mergeCells(row, 2, row, 3)
        }
        if (i < newPList.length) {
          const p = newPList[i] as Record<string, unknown>
          const pSlips = slips.filter((s: Record<string, unknown>) => s.patient_id === p.id && (s.visit_date as string).startsWith(ms))
          const vals = [
            p.name || '', p.referral_source || '', p.chief_complaint || '', '', '', ''
          ]
          vals.forEach((v, ci) => { const c = ws.getCell(row, 8 + ci); c.value = v as string; applyCell(c) })
        }
      }
      r += maxKpiRows + 2

      // 広告媒体別
      const monthChannels: Record<string, { cost: number; newPatients: number }> = {}
      adCosts.filter(a => a.month === ms).forEach(a => {
        if (!monthChannels[a.channel]) monthChannels[a.channel] = { cost: 0, newPatients: 0 }
        monthChannels[a.channel].cost += a.cost
        monthChannels[a.channel].newPatients += a.new_patients
      })
      const mchEntries = Object.entries(monthChannels).sort((a, b) => b[1].cost - a[1].cost)

      ws.mergeCells(r, 1, r, 6)
      ws.getCell(r, 1).value = '【広告媒体別実績】'
      ws.getCell(r, 1).font = { bold: true, size: 11 }

      // 右側: 固定費・損益
      ws.mergeCells(r, 8, r, 10)
      ws.getCell(r, 8).value = '【固定費・損益】'
      ws.getCell(r, 8).font = { bold: true, size: 11 }
      r++

      const adHeaders = ['媒体', '新規数', '問合せ', 'アクセス', '反応率', 'CV率', '費用', '売上', 'LTV', 'CPA', '利益LTV']
      // 広告テーブルは幅が広いので列1-6に収める（簡略版）
      const adHeadersShort = ['媒体', '新規数', '費用', 'CPA']
      adHeadersShort.forEach((h, ci) => { const c = ws.getCell(r, 1 + ci); c.value = h; applySubHeader(c) })

      const costLabels = ['項目', '金額']
      costLabels.forEach((h, ci) => { const c = ws.getCell(r, 8 + ci); c.value = h; applySubHeader(c) })
      r++

      const costRows: [string, string | number][] = [
        ['家賃', ''], ['水道光熱費・通信費', ''], ['セミナー・移動費', ''],
        ['分割支払い', ''], ['雑費', ''], ['固定費合計', ''],
        ['広告費', Object.values(monthChannels).reduce((s, c) => s + c.cost, 0) || ''],
        ['純利益', ''],
      ]

      const adRowCount = Math.max(mchEntries.length + 1, costRows.length)
      for (let i = 0; i < adRowCount; i++) {
        const row = r + i
        if (i < mchEntries.length) {
          const [ch, data] = mchEntries[i]
          const vals = [ch, data.newPatients, data.cost, data.newPatients > 0 ? Math.round(data.cost / data.newPatients) : '']
          vals.forEach((v, ci) => { const c = ws.getCell(row, 1 + ci); c.value = v; applyCell(c, ci > 0) })
        } else if (i === mchEntries.length) {
          const totalAd = Object.values(monthChannels).reduce((s, c) => s + c.cost, 0)
          const c1 = ws.getCell(row, 1); c1.value = '合計'; applyTotal(c1)
          const c3 = ws.getCell(row, 3); c3.value = totalAd || ''; applyTotal(c3, true)
        }
        if (i < costRows.length) {
          const c1 = ws.getCell(row, 8); c1.value = costRows[i][0]
          const label = String(costRows[i][0])
          applyCell(c1); if (label.includes('合計') || label === '純利益') applyTotal(c1)
          const c2 = ws.getCell(row, 9); c2.value = costRows[i][1]
          applyCell(c2, true); if (label.includes('合計') || label === '純利益') applyTotal(c2, true)
        }
      }
      r += adRowCount + 2

      // 既存患者売上
      ws.mergeCells(r, 1, r, 4)
      ws.getCell(r, 1).value = '【既存患者売上一覧】'
      ws.getCell(r, 1).font = { bold: true, size: 11 }

      ws.mergeCells(r, 8, r, 13)
      ws.getCell(r, 8).value = '【振り返り】'
      ws.getCell(r, 8).font = { bold: true, size: 11 }
      r++

      const existHeaders = ['氏名', '媒体', '金額']
      existHeaders.forEach((h, ci) => { const c = ws.getCell(r, 1 + ci); c.value = h; applySubHeader(c) })
      r++

      const monthSlips = slips.filter((s: Record<string, unknown>) => (s.visit_date as string).startsWith(ms))
      const existMap: Record<string, { name: string; source: string; revenue: number }> = {}
      monthSlips.forEach((s: Record<string, unknown>) => {
        const pid = s.patient_id as string
        if (!pid || newIds.has(pid)) return
        if (!existMap[pid]) {
          const pat = patients.find((p: Record<string, unknown>) => p.id === pid)
          existMap[pid] = { name: (s.patient_name || (pat as Record<string, unknown>)?.name || '') as string, source: ((pat as Record<string, unknown>)?.referral_source || '') as string, revenue: 0 }
        }
        existMap[pid].revenue += (Number(s.total_price) || 0)
      })
      const existEntries = Object.values(existMap).sort((a, b) => b.revenue - a.revenue)
      existEntries.forEach(ex => {
        const vals: (string | number)[] = [ex.name, ex.source, ex.revenue]
        vals.forEach((v, ci) => { const c = ws.getCell(r, 1 + ci); c.value = v; applyCell(c, ci === 2) })
        r++
      })
      if (existEntries.length > 0) {
        const c1 = ws.getCell(r, 1); c1.value = '合計'; applyTotal(c1)
        const c3 = ws.getCell(r, 3); c3.value = md.existRev; applyTotal(c3, true)
        r++
      }
    }

    // ======= 年間サマリーシート =======
    const generateAnnualSheet = () => {
      const ws = wb.addWorksheet('年間サマリー')
      ws.properties.defaultRowHeight = 20
      const colW = [6, 10, 10, 8, 8, 14, 14, 8, 14, 14, 10, 12, 10, 10, 10, 8]
      colW.forEach((w, i) => { ws.getColumn(i + 1).width = w })

      let r = 1
      ws.mergeCells(r, 1, r, 16)
      const t = ws.getCell(r, 1)
      t.value = `${year}年 年間統計表`
      t.font = { bold: true, size: 14 }
      r += 2

      const headers = ['月', '施術回数', 'カルテ枚数', '頻度', '新規数', '売上', '売上目標', '達成率', '新規売上', '既存売上', '単価', '広告費', 'CPA', '新規LTV', '利益LTV', 'ROAS']
      headers.forEach((h, ci) => { applyHeader(ws.getCell(r, ci + 1)); ws.getCell(r, ci + 1).value = h })
      r++

      const totalUniqueYear = new Set(slips.map((s: Record<string, unknown>) => s.patient_id).filter(Boolean)).size
      const totalRevYear = slips.reduce((s: number, sl: Record<string, unknown>) => s + (Number(sl.total_price) || 0), 0)
      const yearNewP = patients.filter((p: Record<string, unknown>) => (p.first_visit_date as string)?.startsWith(String(year))).length
      const totalAdYear = adCosts.reduce((s, a) => s + a.cost, 0)
      const normal = slips.filter((s: Record<string, unknown>) => (Number(s.total_price) || 0) > 0 && (Number(s.total_price) || 0) < 50000)
      const avgPYear = normal.length > 0 ? Math.round(normal.reduce((s: number, sl: Record<string, unknown>) => s + (Number(sl.total_price) || 0), 0) / normal.length) : 0
      let totalNewRev = 0, totalExistRev = 0

      monthlyData.forEach(md => {
        totalNewRev += md.newRev; totalExistRev += md.existRev
        const revPct = md.revenueGoal > 0 ? Math.round(md.revenue / md.revenueGoal * 100) : null
        const vals: (string | number)[] = [
          `${md.m}月`, md.visitCount || '', md.uniqueCount || '', md.frequency > 0 ? md.frequency : '',
          md.newP || '', md.revenue || '', md.revenueGoal || '',
          revPct !== null ? `${revPct}%` : '', md.newRev || '', md.existRev || '',
          md.avgP || '', md.adCost || '', md.cpa || '', md.ltv || '',
          md.profitLtv || '', md.roas !== null ? `${md.roas}%` : '',
        ]
        vals.forEach((v, ci) => {
          const c = ws.getCell(r, ci + 1)
          c.value = v === '' ? '' : v
          applyCell(c, ci > 0 && typeof v === 'number')
        })
        r++
      })

      // 合計行
      const yearLtv = yearNewP > 0 ? Math.round(Object.values(newPatientRevMap).reduce((s, v) => s + v, 0) / yearNewP) : ''
      const yearCpa = totalAdYear > 0 && yearNewP > 0 ? Math.round(totalAdYear / yearNewP) : ''
      const yearProfitLtv = typeof yearLtv === 'number' && typeof yearCpa === 'number' ? yearLtv - yearCpa : ''
      const totalVals: (string | number)[] = [
        '合計/平均', slips.length, totalUniqueYear,
        totalUniqueYear > 0 ? Math.round(slips.length / totalUniqueYear * 10) / 10 : '',
        yearNewP, totalRevYear,
        goals.reduce((s, g) => s + g.revenue_goal, 0) || '',
        goals.reduce((s, g) => s + g.revenue_goal, 0) > 0 ? `${Math.round(totalRevYear / goals.reduce((s, g) => s + g.revenue_goal, 0) * 100)}%` : '',
        totalNewRev || '', totalExistRev || '', avgPYear || '', totalAdYear || '',
        yearCpa, yearLtv, yearProfitLtv,
        totalAdYear > 0 ? `${Math.round(totalRevYear / totalAdYear * 100)}%` : '',
      ]
      totalVals.forEach((v, ci) => { const c = ws.getCell(r, ci + 1); c.value = v === '' ? '' : v; applyTotal(c, ci > 0 && typeof v === 'number') })
      r += 3

      // 年間KPIサマリー
      ws.mergeCells(r, 1, r, 4)
      ws.getCell(r, 1).value = '【年間KPIサマリー】'
      ws.getCell(r, 1).font = { bold: true, size: 11 }
      r++
      const kpis: [string, string | number][] = [
        ['累計売上', totalRevYear], ['総カルテ枚数', totalUniqueYear],
        ['総施術回数', slips.length], ['平均施術単価', avgPYear],
        ['新規患者数', yearNewP], ['年間平均LTV', yearLtv],
        ['総広告費', totalAdYear || ''], ['年間平均CPA', yearCpa],
        ['平均利益LTV', yearProfitLtv],
      ]
      kpis.forEach(([label, val]) => {
        const c1 = ws.getCell(r, 1); c1.value = label; applySubHeader(c1)
        const c2 = ws.getCell(r, 2); c2.value = val === '' ? '' : val; applyCell(c2, typeof val === 'number')
        ws.mergeCells(r, 2, r, 3)
        r++
      })
    }

    // シート生成
    if (month) {
      generateMonthSheet(month)
    } else {
      // 年間：12ヶ月分 + サマリー
      for (let m = 1; m <= 12; m++) generateMonthSheet(m)
      generateAnnualSheet()
    }

    const buffer = await wb.xlsx.writeBuffer()
    const filename = month
      ? `月間統計表_${year}年${month}月.xlsx`
      : `年間統計表_${year}年.xlsx`

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'エクスポートに失敗しました' }, { status: 500 })
  }
}
