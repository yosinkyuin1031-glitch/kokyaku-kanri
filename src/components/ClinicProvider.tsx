'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getClinicIdClient } from '@/lib/clinic'

// 認証不要パス（ClinicProviderでプリロード不要）
const PUBLIC_PATHS = ['/login', '/signup']

/**
 * アプリ起動時にclinic_idをプリロードするプロバイダ。
 * これによりgetClinicId()の同期呼び出しでキャッシュ値が使われるようになる。
 * ログイン/サインアップ画面ではスキップ。
 */
export default function ClinicProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const pathname = usePathname()
  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  useEffect(() => {
    if (isPublic) {
      setReady(true)
      return
    }
    getClinicIdClient().then(() => setReady(true)).catch(() => setReady(true))
  }, [isPublic])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-3 border-gray-300 border-t-[#14252A] rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-400">読み込み中...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
