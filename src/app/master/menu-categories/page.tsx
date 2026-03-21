'use client'
import SimpleMasterPage from '@/components/SimpleMasterPage'

export default function Page() {
  return <SimpleMasterPage title="メニュー分類" tableName="cm_menu_categories" columns={[
    { key: 'name', label: '分類名' },
    { key: 'sort_order', label: '表示順', type: 'number', width: '80px' },
    { key: 'is_active', label: '有効', type: 'boolean', width: '80px' },
  ]} />
}
