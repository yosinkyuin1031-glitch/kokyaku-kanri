'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const mainTabs = [
  { key: 'home', href: '/', label: 'ホーム', icon: '🏠' },
  { key: 'patients', href: '/patients', label: '顧客管理', icon: '👥' },
  { key: 'sales', href: '/sales', label: '営業データ', icon: '📊' },
  { key: 'master', href: '/master', label: 'マスター', icon: '⚙️' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const activeTab = pathname.startsWith('/master') ? 'master'
    : pathname.startsWith('/patients') ? 'patients'
    : pathname.startsWith('/sales') || pathname.startsWith('/visits') ? 'sales'
    : 'home'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* トップナビ */}
      <header className="sticky top-0 z-50 text-white" style={{ background: '#14252A' }}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between h-12">
            <Link href="/" className="font-bold text-sm flex items-center gap-1.5">
                顧客管理シート
              </Link>
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-white text-xl">☰</button>
          </div>
          {/* タブ（PC） */}
          <nav className="hidden md:flex gap-1 -mb-px">
            {mainTabs.map(tab => (
              <Link
                key={tab.key}
                href={tab.href}
                className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${
                  activeTab === tab.key
                    ? 'bg-gray-50 text-gray-800'
                    : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>{tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* モバイルメニュー */}
      {menuOpen && (
        <div className="md:hidden bg-white border-b shadow-lg z-40 relative">
          {mainTabs.map(tab => (
            <Link
              key={tab.key}
              href={tab.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-4 py-3 text-sm border-b border-gray-100 ${
                activeTab === tab.key ? 'bg-blue-50 font-bold text-gray-800' : 'text-gray-600'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>{tab.label}
            </Link>
          ))}
        </div>
      )}

      {/* モバイル下部タブ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex justify-around items-center h-16">
          {mainTabs.map(tab => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex flex-col items-center justify-center w-full h-full py-3 text-xs relative ${
                activeTab === tab.key ? 'text-[#14252A] font-bold' : 'text-gray-400'
              }`}
            >
              <span className="text-xl mb-1">{tab.icon}</span>
              <span className="text-[10px]">{tab.label}</span>
              {activeTab === tab.key && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full" style={{ background: '#14252A' }} />
              )}
            </Link>
          ))}
        </div>
      </nav>

      {/* メインコンテンツ */}
      <main className="pb-24 md:pb-4">
        {children}
      </main>
    </div>
  )
}
