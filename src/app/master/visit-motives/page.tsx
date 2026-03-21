'use client'
import SimpleMasterPage from '@/components/SimpleMasterPage'

export default function Page() {
  return <SimpleMasterPage title="来店動機" tableName="cm_visit_motives" columns={[
    { key: 'name', label: '名称' },
    { key: 'sort_order', label: '表示順', type: 'number', width: '80px' },
    { key: 'is_active', label: '有効', type: 'boolean', width: '80px' },
  ]} patientCount={{
    sourceTable: 'cm_patients',
    sourceField: 'visit_motive',
    label: '該当患者数',
  }} />
}
