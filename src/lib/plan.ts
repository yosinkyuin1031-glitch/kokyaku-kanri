import { createClient } from '@/lib/supabase/server'

const FREE_PATIENT_LIMIT = 50

export interface PlanLimitResult {
  allowed: boolean
  message?: string
  currentCount?: number
  limit?: number
  plan?: string
}

/**
 * freeプランの患者数制限をチェック
 * freeプランで患者数が50人を超えていたら制限メッセージを返す
 */
export async function checkPlanLimit(clinicId: string): Promise<PlanLimitResult> {
  const supabase = await createClient()

  // クリニック情報を取得
  const { data: clinic } = await supabase
    .from('clinics')
    .select('plan')
    .eq('id', clinicId)
    .single()

  const plan = clinic?.plan || 'free'

  // free以外は制限なし
  if (plan !== 'free') {
    return { allowed: true, plan }
  }

  // 患者数をカウント
  const { count } = await supabase
    .from('cm_patients')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)

  const currentCount = count || 0

  if (currentCount >= FREE_PATIENT_LIMIT) {
    return {
      allowed: false,
      message: `無料プランの患者登録上限（${FREE_PATIENT_LIMIT}人）に達しています。ベーシックプランにアップグレードすると無制限に登録できます。`,
      currentCount,
      limit: FREE_PATIENT_LIMIT,
      plan,
    }
  }

  return {
    allowed: true,
    currentCount,
    limit: FREE_PATIENT_LIMIT,
    plan,
  }
}
