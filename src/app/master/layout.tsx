import AppShell from '@/components/AppShell'
import MasterLayout from '@/components/MasterLayout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell><MasterLayout>{children}</MasterLayout></AppShell>
}
