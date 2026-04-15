'use client'

import Link from 'next/link'
import AppShell from '@/components/AppShell'

const sections = [
  {
    title: '顧客管理',
    items: [
      { label: '患者一覧', href: '/patients', desc: '全患者の一覧表示。LTV・最終来院・経過日数でソート可能。連番表示付き。CSV出力・はがきDM宛名印刷にも対応。' },
      { label: '新規患者登録', href: '/patients/new', desc: '新しい患者を登録。来店動機・症状・職業はマスターから選択。' },
      { label: 'CSVインポート', href: '/patients/import', desc: '既存データの一括取り込み。補完モードで既存患者の追加情報更新も可能。' },
      { label: '一括編集', href: '/patients/bulk-edit', desc: '複数患者のステータス・来院経路等を一括変更。' },
    ],
  },
  {
    title: '売上分析',
    items: [
      { label: '売上一覧', href: '/sales/revenue', desc: '日別・月別・年別の売上推移。' },
      { label: '新規売上 / 既存売上', href: '/sales/new-existing', desc: '純新規売上（その期間に初来院した患者の全売上）と既存売上を分離表示。月別・年間・全期間・期間指定に対応。年間ビューでは「その年の新規患者が年間で生んだ売上」が一目で分かる。' },
      { label: '伝票管理', href: '/sales/slips', desc: '来院ごとの伝票入力・編集。施術メニュー・金額を管理。' },
    ],
  },
  {
    title: 'LTV・リピート分析',
    items: [
      { label: 'LTV分析', href: '/sales/ltv', desc: '患者ごとの生涯売上（LTV）ランキング。年齢・来院数・平均単価も表示。' },
      { label: 'リピート分析', href: '/sales/repeat', desc: '2回〜10回以上の回数別リピート率をグラフ表示。年齢付きの患者別来院回数リストも確認可能。' },
    ],
  },
  {
    title: '広告・ROAS分析',
    items: [
      { label: '広告費入力', href: '/sales/ad-costs', desc: '媒体別の広告費・表示回数・クリック/枚数・問合せ数を入力。媒体名はマスター管理の「来店動機」から自動取得。新規患者数・新規売上・反応率・CV率・CPAが自動計測される。' },
      { label: 'ROAS分析', href: '/sales/roas', desc: '媒体別のROAS（広告費用対効果）・CPA・反応率・CV率を一覧表示。来院動機と広告費を自動マッチング。' },
    ],
  },
  {
    title: 'エリア分析',
    items: [
      { label: 'エリア別LTV', href: '/sales/area-ltv', desc: '市区町村別の患者数・平均LTV・総売上ランキング。媒体別の集客内訳も表示。どのエリアからどの媒体で患者が来ているか一目で分かる。' },
      { label: '患者分布マップ', href: '/sales/map', desc: '患者の住所を地図上にプロット。集客エリアを視覚的に把握。' },
    ],
  },
  {
    title: 'クロス集計・その他分析',
    items: [
      { label: 'クロス集計', href: '/sales/cross', desc: '年代別（10歳未満〜90代）× 性別・症状・来院経路・ステータスなど、複数軸でのクロス分析。' },
      { label: '稼働率分析', href: '/sales/utilization', desc: '曜日別・時間帯別の稼働率を自動集計。空き時間の把握に。' },
      { label: '時間帯別分析', href: '/sales/hourly', desc: '時間帯ごとの来院数・売上を可視化。' },
      { label: '統計ダッシュボード', href: '/stats', desc: '主要KPIをまとめたダッシュボード。新規数・リピート率・LTV・売上推移を一画面で確認。' },
    ],
  },
  {
    title: 'マスター管理',
    items: [
      { label: '来店動機', href: '/master/visit-motives', desc: '来院経路の選択肢を管理。広告費入力の媒体名にも自動連動。該当患者数も表示。' },
      { label: '症状', href: '/master/symptoms', desc: '主訴の選択肢を管理。' },
      { label: '職業', href: '/master/occupations', desc: '職業の選択肢を管理。' },
      { label: '顧客区分', href: '/master/customer-categories', desc: 'VIP・新規・リピーター等の区分を管理。' },
      { label: 'メニュー管理', href: '/master/base-menus', desc: '施術メニュー・料金の登録。' },
      { label: '施設情報', href: '/master/facility', desc: '院名・住所・営業時間の設定。' },
    ],
  },
  {
    title: '計算式の解説',
    items: [
      { label: '反応率', href: '', desc: 'クリック数（枚数） ÷ 表示回数 × 100（%）。WEB広告ならCTR、チラシなら反応率として機能。' },
      { label: 'CV率', href: '', desc: '新規患者数（自動計測） ÷ クリック数（枚数） × 100（%）。広告接触者のうち何%が来院したかを示す。' },
      { label: 'CPA', href: '', desc: '広告費 ÷ 新規患者数（自動計測）。1人の新規患者を獲得するのにかかったコスト。' },
      { label: 'ROAS', href: '', desc: '売上 ÷ 広告費 × 100（%）。100%以上なら広告費以上の売上が出ている。' },
      { label: 'LTV', href: '', desc: '患者の累計売上（生涯顧客価値）。伝票の合計から自動計算。' },
      { label: '純新規売上', href: '', desc: '選択期間に初来院した患者の「全売上」（2回目以降含む）。年間ビューなら「その年に初めて来た患者が年間で生んだ売上」。' },
    ],
  },
]

export default function HelpPage() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-800 mb-1">ヘルプ・機能一覧</h1>
        <p className="text-xs text-gray-400 mb-6">Clinic Coreの全機能と操作方法の説明です</p>

        <div className="space-y-6">
          {sections.map(s => (
            <div key={s.title} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b" style={{ backgroundColor: '#14252A' }}>
                <h2 className="font-bold text-white text-sm">{s.title}</h2>
              </div>
              <div className="divide-y">
                {s.items.map(item => (
                  <div key={item.label} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {item.href ? (
                          <Link href={item.href} className="font-medium text-sm text-blue-600 hover:underline">{item.label}</Link>
                        ) : (
                          <span className="font-medium text-sm text-gray-800">{item.label}</span>
                        )}
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                      {item.href && (
                        <Link href={item.href} className="text-xs text-gray-400 hover:text-blue-600 shrink-0 pt-0.5">→</Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-blue-50 rounded-xl p-4">
          <h3 className="font-bold text-sm text-gray-700 mb-2">お困りの場合</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            操作方法がわからない場合やご要望がある場合は、LINEにてお気軽にご連絡ください。
          </p>
          <a href="https://lin.ee/XnKG2IY" target="_blank" rel="noopener noreferrer"
            className="inline-block mt-3 px-4 py-2 text-white text-sm rounded-lg font-bold" style={{ background: '#14252A' }}>
            LINEで問い合わせる
          </a>
        </div>
      </div>
    </AppShell>
  )
}
