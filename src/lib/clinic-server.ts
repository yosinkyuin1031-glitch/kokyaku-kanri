/**
 * サーバーコンポーネント専用: clinic_idを動的に取得
 * ※ このファイルはサーバーコンポーネント・API Routeからのみインポートすること
 */

import { createClient } from '@/lib/supabase/server'

const DEFAULT_CLINIC_ID = '00000000-0000-0000-0000-000000000001'

export async function getClinicIdServer(): Promise<string> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return DEFAULT_CLINIC_ID

    const { data: membership } = await supabase
      .from('clinic_members')
      .select('clinic_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (membership?.clinic_id) {
      return membership.clinic_id
    }

    return DEFAULT_CLINIC_ID
  } catch {
    return DEFAULT_CLINIC_ID
  }
}
