'use client'
import SimpleMasterPage from '@/components/SimpleMasterPage'

export default function Page() {
  return <SimpleMasterPage title="使用者管理" tableName="cm_staff" sortField="created_at" columns={[
    { key: 'name', label: '氏名' },
    { key: 'role', label: '役割', type: 'select', options: ['admin', 'staff'], width: '100px' },
    { key: 'email', label: 'メール' },
    { key: 'phone', label: '電話番号' },
    { key: 'is_active', label: '有効', type: 'boolean', width: '70px' },
  ]} patientCount={{
    sourceTable: 'cm_slips',
    sourceField: 'staff_name',
    label: '施術回数',
  }} />
}
