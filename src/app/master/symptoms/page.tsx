'use client'
import SimpleMasterPage from '@/components/SimpleMasterPage'

export default function Page() {
  return <SimpleMasterPage title="症状" tableName="cm_symptoms" columns={[
    { key: 'name', label: '症状名' },
    { key: 'category', label: 'カテゴリ' },
    { key: 'sort_order', label: '表示順', type: 'number', width: '80px' },
    { key: 'is_active', label: '有効', type: 'boolean', width: '80px' },
  ]} patientCount={{
    sourceTable: 'cm_patients',
    sourceField: 'chief_complaint',
    partialMatch: true,
    label: '該当患者数',
  }} />
}
