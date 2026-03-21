'use client'

import { useEffect, useState } from 'react'
import { getClinicIdClient } from './clinic'

/**
 * クライアントコンポーネント用フック: clinic_idを動的に取得
 * 初回はnullを返し、取得完了後にclinic_idをセットする
 */
export function useClinicId(): { clinicId: string | null; loading: boolean } {
  const [clinicId, setClinicId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getClinicIdClient().then(id => {
      if (!cancelled) {
        setClinicId(id)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  return { clinicId, loading }
}
