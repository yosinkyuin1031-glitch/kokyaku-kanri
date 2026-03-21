'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'

interface Column {
  key: string
  label: string
  type?: 'text' | 'number' | 'boolean' | 'color' | 'select'
  options?: string[]
  width?: string
}

// 患者数カウント設定
interface PatientCountConfig {
  sourceTable: string       // 参照元テーブル (cm_patients or cm_slips)
  sourceField: string       // 参照元フィールド (chief_complaint, occupation等)
  matchKey?: string         // マスターデータのどのキーでマッチするか (デフォルト: 'name')
  label?: string            // カウント列のラベル (デフォルト: '該当者数')
  partialMatch?: boolean    // 部分一致（chief_complaintのようにカンマ区切り）
}

interface Props {
  title: string
  tableName: string
  columns: Column[]
  defaultValues?: Record<string, unknown>
  sortField?: string
  patientCount?: PatientCountConfig
}

export default function SimpleMasterPage({ title, tableName, columns, defaultValues = {}, sortField = 'sort_order', patientCount }: Props) {
  const supabase = createClient()
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [adding, setAdding] = useState(false)
  const [countMap, setCountMap] = useState<Record<string, number>>({})

  const clinicId = getClinicId()

  const loadCounts = async () => {
    if (!patientCount) return
    const { sourceTable, sourceField } = patientCount
    const { data } = await supabase
      .from(sourceTable)
      .select(sourceField)
      .eq('clinic_id', clinicId)
    if (!data) return

    const counts: Record<string, number> = {}
    for (const row of data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const val = (row as any)[sourceField]
      if (!val || typeof val !== 'string') continue
      if (patientCount.partialMatch) {
        // カンマ・読点・スペース区切りで複数値を分解
        const parts = val.split(/[,、\s]+/).map(s => s.trim()).filter(Boolean)
        for (const part of parts) {
          counts[part] = (counts[part] || 0) + 1
        }
      } else {
        counts[val] = (counts[val] || 0) + 1
      }
    }
    setCountMap(counts)
  }

  const load = async () => {
    const { data } = await supabase.from(tableName).select('*').eq('clinic_id', clinicId).order(sortField)
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load(); loadCounts() }, [])

  const handleAdd = async () => {
    const newItem: Record<string, unknown> = { ...defaultValues }
    columns.forEach(col => {
      if (!(col.key in newItem)) {
        newItem[col.key] = col.type === 'number' ? 0 : col.type === 'boolean' ? true : ''
      }
    })
    newItem.sort_order = items.length + 1
    newItem.clinic_id = clinicId
    const { data } = await supabase.from(tableName).insert(newItem).select().single()
    if (data) {
      setItems([...items, data])
      setEditingId(data.id as string)
      setForm(data)
    }
  }

  const handleSave = async () => {
    if (!editingId) return
    await supabase.from(tableName).update(form).eq('id', editingId)
    await load()
    setEditingId(null)
    setForm({})
  }

  const handleDelete = async (id: string) => {
    await supabase.from(tableName).delete().eq('id', id)
    setItems(items.filter(i => i.id !== id))
  }

  const inputClass = "w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#14252A]"

  return (
    <div className="bg-white rounded-xl shadow-sm">
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="font-bold text-gray-800">{title}</h2>
        <button
          onClick={handleAdd}
          className="text-white text-sm px-4 py-2 rounded-lg font-medium"
          style={{ background: '#14252A' }}
        >
          + 追加
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-center py-8 text-sm">読み込み中...</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400 text-center py-8 text-sm">データがありません</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                {columns.map(col => (
                  <th key={col.key} className="text-left px-4 py-2 text-xs font-medium text-gray-500" style={{ width: col.width }}>
                    {col.label}
                  </th>
                ))}
                {patientCount && (
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500" style={{ width: '100px' }}>
                    {patientCount.label || '該当者数'}
                  </th>
                )}
                <th className="px-4 py-2 text-xs text-gray-500 w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id as string} className="border-b hover:bg-gray-50">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-2">
                      {editingId === item.id ? (
                        col.type === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={!!form[col.key]}
                            onChange={(e) => setForm({ ...form, [col.key]: e.target.checked })}
                          />
                        ) : col.type === 'color' ? (
                          <input
                            type="color"
                            value={(form[col.key] as string) || '#666'}
                            onChange={(e) => setForm({ ...form, [col.key]: e.target.value })}
                            className="w-10 h-8 rounded cursor-pointer"
                          />
                        ) : col.type === 'select' ? (
                          <select
                            value={(form[col.key] as string) || ''}
                            onChange={(e) => setForm({ ...form, [col.key]: e.target.value })}
                            className={inputClass}
                          >
                            <option value="">選択</option>
                            {col.options?.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            type={col.type === 'number' ? 'number' : 'text'}
                            value={(form[col.key] as string | number) ?? ''}
                            onChange={(e) => setForm({ ...form, [col.key]: col.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value })}
                            className={inputClass}
                          />
                        )
                      ) : (
                        col.type === 'boolean' ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${item[col.key] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {item[col.key] ? '有効' : '無効'}
                          </span>
                        ) : col.type === 'color' ? (
                          <span className="flex items-center gap-1">
                            <span className="w-4 h-4 rounded-full inline-block" style={{ background: (item[col.key] as string) || '#666' }} />
                            <span className="text-xs text-gray-400">{item[col.key] as string}</span>
                          </span>
                        ) : (
                          <span>{item[col.key] as string | number}</span>
                        )
                      )}
                    </td>
                  ))}
                  {patientCount && (
                    <td className="px-4 py-2 text-right">
                      {(() => {
                        const matchKey = patientCount.matchKey || 'name'
                        const name = item[matchKey] as string
                        const count = countMap[name] || 0
                        return count > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-sm font-semibold text-[#14252A]">{count}</span>
                            <span className="text-xs text-gray-400">人</span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">0</span>
                        )
                      })()}
                    </td>
                  )}
                  <td className="px-4 py-2">
                    {editingId === item.id ? (
                      <div className="flex gap-1">
                        <button onClick={handleSave} className="text-xs text-white bg-blue-600 px-2 py-1 rounded">保存</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 px-2 py-1">取消</button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingId(item.id as string); setForm(item) }} className="text-xs text-blue-600 px-2 py-1">編集</button>
                        <button onClick={() => handleDelete(item.id as string)} className="text-xs text-red-400 px-2 py-1">削除</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
