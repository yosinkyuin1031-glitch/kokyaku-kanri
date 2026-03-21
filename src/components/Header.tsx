'use client'

import { createClient } from '@/lib/supabase/client'

export default function Header({ title }: { title: string }) {
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-40 text-white px-4 py-3 flex justify-between items-center" style={{ background: '#14252A' }}>
      <h1 className="text-lg font-bold">{title}</h1>
      <button onClick={handleLogout} className="text-xs text-gray-300 hover:text-white">
        ログアウト
      </button>
    </header>
  )
}
