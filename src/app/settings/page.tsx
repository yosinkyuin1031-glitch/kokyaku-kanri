'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'

type PlanType = 'free' | 'basic' | 'pro'

const PLAN_LABELS: Record<PlanType, string> = {
  free: '無料プラン',
  basic: 'ベーシックプラン',
  pro: 'プロプラン',
}

const PLAN_DESCRIPTIONS: Record<PlanType, string> = {
  free: '患者数上限50人・基本機能',
  basic: '月額¥4,980 / 患者数無制限・全機能',
  pro: '月額¥9,800 / 複数スタッフ・API連携等（準備中）',
}

export default function SettingsPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [clinicName, setClinicName] = useState('')
  const [plan, setPlan] = useState<PlanType>('free')
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null)
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [patientCount, setPatientCount] = useState<number>(0)

  // メール・パスワード変更
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailMsg, setEmailMsg] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  const clinicId = getClinicId()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setEmail(user.email || '')

      // クリニック情報を取得
      const { data: clinic } = await supabase
        .from('clinics')
        .select('name, plan, stripe_customer_id, plan_expires_at')
        .eq('id', clinicId)
        .single()

      if (clinic) {
        setClinicName(clinic.name || '')
        setPlan((clinic.plan as PlanType) || 'free')
        setStripeCustomerId(clinic.stripe_customer_id || null)
        setPlanExpiresAt(clinic.plan_expires_at || null)
      }

      // 患者数を取得
      const { count } = await supabase
        .from('cm_patients')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)

      setPatientCount(count || 0)
    }
    load()
  }, [])

  const handleUpgrade = async (targetPlan: 'basic' | 'pro') => {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, plan: targetPlan }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'エラーが発生しました')
      }
    } catch {
      alert('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleManagePlan = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'エラーが発生しました')
      }
    } catch {
      alert('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) return
    setEmailLoading(true)
    setEmailMsg('')
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
    if (error) {
      setEmailMsg('変更に失敗しました: ' + error.message)
    } else {
      setEmailMsg('確認メールを送信しました。新しいメールアドレスで確認してください。')
      setNewEmail('')
    }
    setEmailLoading(false)
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      setPwMsg('パスワードは6文字以上で入力してください')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwMsg('パスワードが一致しません')
      return
    }
    setPwLoading(true)
    setPwMsg('')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPwMsg('変更に失敗しました: ' + error.message)
    } else {
      setPwMsg('パスワードを変更しました')
      setNewPassword('')
      setConfirmPassword('')
    }
    setPwLoading(false)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <AppShell>
      <Header title="設定" />
      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">

        <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
          <h3 className="font-bold text-gray-800 text-sm mb-3">アカウント情報</h3>
          <p className="text-sm text-gray-600">現在のメールアドレス: {email}</p>

          {/* メールアドレス変更 */}
          <div className="border-t pt-3">
            <label className="block text-xs text-gray-500 mb-1">メールアドレスを変更</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A]"
                placeholder="新しいメールアドレス"
              />
              <button
                onClick={handleChangeEmail}
                disabled={emailLoading || !newEmail.trim()}
                className="px-4 py-2 bg-[#14252A] text-white text-xs rounded-lg disabled:opacity-50"
              >
                {emailLoading ? '...' : '変更'}
              </button>
            </div>
            {emailMsg && <p className={`text-xs mt-1 ${emailMsg.includes('失敗') ? 'text-red-500' : 'text-green-600'}`}>{emailMsg}</p>}
          </div>

          {/* パスワード変更 */}
          <div className="border-t pt-3">
            <label className="block text-xs text-gray-500 mb-1">パスワードを変更</label>
            <div className="space-y-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A]"
                placeholder="新しいパスワード（6文字以上）"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A]"
                placeholder="パスワード確認（もう一度入力）"
              />
              <button
                onClick={handleChangePassword}
                disabled={pwLoading || !newPassword}
                className="w-full py-2 bg-[#14252A] text-white text-xs rounded-lg disabled:opacity-50"
              >
                {pwLoading ? '変更中...' : 'パスワードを変更'}
              </button>
            </div>
            {pwMsg && <p className={`text-xs mt-1 ${pwMsg.includes('失敗') || pwMsg.includes('一致') || pwMsg.includes('6文字') ? 'text-red-500' : 'text-green-600'}`}>{pwMsg}</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-bold text-gray-800 text-sm mb-3">院情報</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <p>{clinicName || '未設定'}</p>
          </div>
        </div>

        {/* プラン管理セクション */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-bold text-gray-800 text-sm mb-3">プラン管理</h3>

          {/* 現在のプラン表示 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                plan === 'free' ? 'bg-gray-100 text-gray-600' :
                plan === 'basic' ? 'bg-blue-100 text-blue-700' :
                'bg-purple-100 text-purple-700'
              }`}>
                {PLAN_LABELS[plan]}
              </span>
            </div>
            <p className="text-xs text-gray-500">{PLAN_DESCRIPTIONS[plan]}</p>

            {plan === 'free' && (
              <div className="mt-2 text-xs text-gray-500">
                患者登録数: <span className={patientCount >= 50 ? 'text-red-500 font-bold' : 'text-gray-700'}>
                  {patientCount}
                </span> / 50人
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                  <div
                    className={`h-1.5 rounded-full ${patientCount >= 50 ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min((patientCount / 50) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {planExpiresAt && plan !== 'free' && (
              <p className="text-xs text-gray-400 mt-1">
                次回更新日: {formatDate(planExpiresAt)}
              </p>
            )}
          </div>

          {/* アクションボタン */}
          <div className="space-y-2">
            {plan === 'free' && (
              <button
                onClick={() => handleUpgrade('basic')}
                disabled={loading}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '処理中...' : 'ベーシックプランにアップグレード（14日間無料お試し）'}
              </button>
            )}

            {plan === 'basic' && (
              <button
                onClick={() => handleUpgrade('pro')}
                disabled={loading}
                className="w-full py-2.5 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '処理中...' : 'プロプランにアップグレード'}
              </button>
            )}

            {stripeCustomerId && (
              <button
                onClick={handleManagePlan}
                disabled={loading}
                className="w-full py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {loading ? '処理中...' : 'プランの管理・解約（Stripe）'}
              </button>
            )}
          </div>

          {plan === 'free' && (
            <p className="text-xs text-gray-400 mt-3">
              ベーシックプランは14日間の無料トライアル付き。トライアル期間中はいつでもキャンセル可能です。
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-bold text-gray-800 text-sm mb-3">データ</h3>
          <p className="text-xs text-gray-400">患者データ・施術記録はSupabaseに安全に保存されています。</p>
        </div>
      </div>
    </AppShell>
  )
}
