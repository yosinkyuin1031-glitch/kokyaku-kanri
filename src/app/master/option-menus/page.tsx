'use client'
import SimpleMasterPage from '@/components/SimpleMasterPage'

export default function Page() {
  return <SimpleMasterPage title="オプションメニュー" tableName="cm_option_menus" columns={[
    { key: 'name', label: 'メニュー名' },
    { key: 'price', label: '料金（円）', type: 'number', width: '100px' },
    { key: 'duration_minutes', label: '時間（分）', type: 'number', width: '100px' },
    { key: 'description', label: '説明' },
    { key: 'sort_order', label: '順', type: 'number', width: '60px' },
    { key: 'is_active', label: '有効', type: 'boolean', width: '70px' },
  ]} />
}
