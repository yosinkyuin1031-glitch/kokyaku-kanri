import type { Metadata } from 'next'
import './globals.css'
import ClinicProvider from '@/components/ClinicProvider'

export const metadata: Metadata = {
  title: '顧客管理シート',
  description: '患者情報・施術記録・来院履歴を一元管理',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased">
        <ClinicProvider>{children}</ClinicProvider>
      </body>
    </html>
  )
}
