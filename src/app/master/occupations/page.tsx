'use client'
import SimpleMasterPage from '@/components/SimpleMasterPage'

export default function Page() {
  return <SimpleMasterPage title="職業" tableName="cm_occupations" columns={[
    { key: 'name', label: '名称' },
    { key: 'sort_order', label: '表示順', type: 'number', width: '80px' },
    { key: 'is_active', label: '有効', type: 'boolean', width: '80px' },
  ]} patientCount={{
    sourceTable: 'cm_patients',
    sourceField: 'occupation',
    label: '該当患者数',
  }} />
}
