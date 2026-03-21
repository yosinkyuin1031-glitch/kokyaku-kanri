import { NextRequest, NextResponse } from 'next/server'
import { stripe, PLAN_PRICES } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { clinicId, plan } = await req.json()

    if (!clinicId || !plan) {
      return NextResponse.json({ error: 'clinicIdとplanは必須です' }, { status: 400 })
    }

    if (plan !== 'basic' && plan !== 'pro') {
      return NextResponse.json({ error: '無効なプランです' }, { status: 400 })
    }

    const planInfo = PLAN_PRICES[plan as keyof typeof PLAN_PRICES]

    const supabase = await createClient()

    // クリニック情報を取得
    const { data: clinic } = await supabase
      .from('clinics')
      .select('id, name, email, stripe_customer_id')
      .eq('id', clinicId)
      .single()

    if (!clinic) {
      return NextResponse.json({ error: 'クリニックが見つかりません' }, { status: 404 })
    }

    // 既存のStripe Customerがあればそれを使う
    let customerId = clinic.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: clinic.name,
        email: clinic.email || undefined,
        metadata: { clinic_id: clinicId },
      })
      customerId = customer.id

      // stripe_customer_idを保存
      await supabase
        .from('clinics')
        .update({ stripe_customer_id: customerId })
        .eq('id', clinicId)
    }

    // Checkout Session作成
    const origin = req.headers.get('origin') || 'http://localhost:3000'
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: {
              name: `顧客管理シート ${planInfo.name}プラン`,
              description: planInfo.description,
            },
            unit_amount: planInfo.price,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 14,
        metadata: { clinic_id: clinicId, plan },
      },
      success_url: `${origin}/settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings`,
      metadata: { clinic_id: clinicId, plan },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe Checkout error:', error)
    return NextResponse.json(
      { error: 'チェックアウトセッションの作成に失敗しました' },
      { status: 500 }
    )
  }
}
