import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://vzkfkazjylrkspqrnhnx.supabase.co',
  'sb_publishable_H1Ch2D2XIuSQMzNL-ns8zg_gAqrx7wL'
)

async function fetchAll() {
  const all = []
  let offset = 0
  while (true) {
    const { data } = await supabase.from('cm_slips').select('*').range(offset, offset + 999)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

async function run() {
  const slips = await fetchAll()

  // base_priceが入っているレコード（メニュー選択あり）
  const withMenu = slips.filter(s => s.base_price > 0)
  // base_price=0だがtotal_price>0（金額直接入力）
  const directInput = slips.filter(s => (!s.base_price || s.base_price === 0) && s.total_price > 0)
  // 0円来院（回数券消化）
  const freeVisit = slips.filter(s => (!s.total_price || s.total_price === 0))

  console.log('=== データ内訳 ===')
  console.log(`メニュー選択あり（base_price>0）: ${withMenu.length}件`)
  console.log(`金額直接入力（base=0, total>0）: ${directInput.length}件`)
  console.log(`0円来院（回数券消化）: ${freeVisit.length}件`)
  console.log(`合計: ${slips.length}件`)

  // メニュー選択ありの価格分布
  console.log('\n=== メニュー選択あり: base_price TOP ===')
  const bpCount = {}
  withMenu.forEach(s => { bpCount[s.base_price] = (bpCount[s.base_price] || 0) + 1 })
  Object.entries(bpCount).sort((a,b) => b[1]-a[1]).slice(0, 10)
    .forEach(([p, c]) => console.log(`  ${Number(p).toLocaleString()}円: ${c}件`))

  // 直接入力の価格分布
  console.log('\n=== 金額直接入力: total_price TOP ===')
  const tpCount = {}
  directInput.forEach(s => { tpCount[s.total_price] = (tpCount[s.total_price] || 0) + 1 })
  Object.entries(tpCount).sort((a,b) => b[1]-a[1]).slice(0, 10)
    .forEach(([p, c]) => console.log(`  ${Number(p).toLocaleString()}円: ${c}件`))

  // 回数券購入と思われるレコード（高額）
  const allPaid = slips.filter(s => s.total_price > 0)
  // 8,800の倍数 or 共通回数券価格をチェック
  const likelyTickets = allPaid.filter(s => s.total_price >= 50000)
  const normalTreatments = allPaid.filter(s => s.total_price > 0 && s.total_price < 50000)

  console.log('\n=== 施術と回数券の分離 ===')
  console.log(`通常施術（〜49,999円）: ${normalTreatments.length}件`)
  console.log(`  売上: ${normalTreatments.reduce((s,r) => s + r.total_price, 0).toLocaleString()}円`)
  console.log(`  平均: ${Math.round(normalTreatments.reduce((s,r) => s + r.total_price, 0) / normalTreatments.length).toLocaleString()}円`)
  console.log(`回数券等（50,000円〜）: ${likelyTickets.length}件`)
  console.log(`  売上: ${likelyTickets.reduce((s,r) => s + r.total_price, 0).toLocaleString()}円`)

  // 全来院を施術として、平均単価を計算（回数券売上は全来院で割る）
  const totalRev = allPaid.reduce((s,r) => s + r.total_price, 0)
  const totalVisits = slips.length
  console.log(`\n=== 全体（回数券売上÷全来院で按分） ===`)
  console.log(`全来院: ${totalVisits}件`)
  console.log(`総売上: ${totalRev.toLocaleString()}円`)
  console.log(`按分単価: ${Math.round(totalRev / totalVisits).toLocaleString()}円`)

  // 時系列でメニュー選択→直接入力の移行を確認
  console.log('\n=== 年別: メニュー選択 vs 直接入力 ===')
  const yearMap = {}
  slips.forEach(s => {
    const y = s.visit_date.slice(0, 4)
    if (!yearMap[y]) yearMap[y] = { menu: 0, direct: 0, free: 0, rev: 0, all: 0 }
    yearMap[y].all++
    if (s.base_price > 0) yearMap[y].menu++
    else if (s.total_price > 0) yearMap[y].direct++
    else yearMap[y].free++
    yearMap[y].rev += s.total_price || 0
  })
  Object.entries(yearMap).sort().forEach(([y, d]) => {
    console.log(`  ${y}: メニュー${d.menu} 直接${d.direct} 0円${d.free} 計${d.all}件 売上${d.rev.toLocaleString()}円 平均${d.all > 0 ? Math.round(d.rev/d.all).toLocaleString() : 0}円`)
  })
}

run()
