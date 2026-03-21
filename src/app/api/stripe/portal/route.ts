import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { clinicId } = await req.json()

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicIdは必須です' }, { status: 400 })
    }

    const supabase = await createClient()

    // クリニック情報を取得
    const { data: clinic } = await supabase
      .from('clinics')
      .select('stripe_customer_id')
      .eq('id', clinicId)
      .single()

    if (!clinic?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Stripeの顧客情報が見つかりません。まずプランをアップグレードしてください。' },
        { status: 404 }
      )
    }

    const origin = req.headers.get('origin') || 'http://localhost:3000'
    const session = await stripe.billingPortal.sessions.create({
      customer: clinic.stripe_customer_id,
      return_url: `${origin}/settings`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe Portal error:', error)
    return NextResponse.json(
      { error: 'ポータルセッションの作成に失敗しました' },
      { status: 500 }
    )
  }
}
