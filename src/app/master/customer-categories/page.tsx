'use client'
import SimpleMasterPage from '@/components/SimpleMasterPage'

export default function Page() {
  return <SimpleMasterPage title="顧客区分" tableName="cm_customer_categories" columns={[
    { key: 'name', label: '名称' },
    { key: 'color', label: 'カラー', type: 'color', width: '100px' },
    { key: 'sort_order', label: '表示順', type: 'number', width: '80px' },
    { key: 'is_active', label: '有効', type: 'boolean', width: '80px' },
  ]} patientCount={{
    sourceTable: 'cm_patients',
    sourceField: 'customer_category',
    label: '該当患者数',
  }} />
}
