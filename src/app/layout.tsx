import type { Metadata } from 'next'
import './globals.css'
import ClinicProvider from '@/components/ClinicProvider'
import { ToastProvider } from '@/components/Toast'

export const metadata: Metadata = {
  title: 'Clinic Core',
  description: '患者情報・施術記録・来院履歴を一元管理',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <ClinicProvider>
          <ToastProvider>{children}</ToastProvider>
        </ClinicProvider>
      </body>
    </html>
  )
}
