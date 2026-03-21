'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const masterSections = [
  {
    title: '1. 基本情報マスター',
    items: [
      { href: '/master/facility', label: '(a) 施設基本情報' },
      { href: '/master/regular-holidays', label: '(b) 定休日設定' },
      { href: '/master/irregular-holidays', label: '(c) 不定休日設定' },
      { href: '/master/display-columns', label: '(d) 顧客一覧表示項目' },
    ]
  },
  {
    title: '2. 顧客関連マスター',
    items: [
      { href: '/master/visit-motives', label: '(a) 来店動機' },
      { href: '/master/occupations', label: '(b) 職業' },
      { href: '/master/customer-categories', label: '(c) 顧客区分' },
      { href: '/master/symptoms', label: '(d) 症状' },
    ]
  },
  {
    title: '3. メニューマスター',
    items: [
      { href: '/master/menu-categories', label: '(a) 分類' },
      { href: '/master/base-menus', label: '(b) 基本メニュー' },
      { href: '/master/option-menus', label: '(c) オプションメニュー' },
    ]
  },
  {
    title: '4. その他マスター',
    items: [
      { href: '/master/staff', label: '(a) 使用者管理' },
    ]
  },
]

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="max-w-5xl mx-auto px-4 py-4">
      <div className="md:flex gap-4">
        {/* サイドバー */}
        <aside className="md:w-64 flex-shrink-0 mb-4 md:mb-0">
          <div className="bg-white rounded-xl shadow-sm p-3 space-y-3 md:sticky md:top-24">
            {masterSections.map(section => (
              <div key={section.title}>
                <p className="text-xs font-bold text-gray-500 mb-1 px-2">{section.title}</p>
                {section.items.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block px-3 py-2 rounded-lg text-sm transition-all ${
                      pathname === item.href
                        ? 'bg-[#14252A] text-white font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* コンテンツ */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  )
}
