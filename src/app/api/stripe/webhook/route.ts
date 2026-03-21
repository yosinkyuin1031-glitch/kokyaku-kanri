import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  const supabase = await createClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const clinicId = session.metadata?.clinic_id
        const plan = session.metadata?.plan || 'basic'

        if (clinicId) {
          await supabase
            .from('clinics')
            .update({
              plan,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
            })
            .eq('id', clinicId)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const clinicId = subscription.metadata?.clinic_id

        if (clinicId) {
          // サブスクリプションのステータスに応じてプランを更新
          const isActive = ['active', 'trialing'].includes(subscription.status)
          const plan = isActive ? (subscription.metadata?.plan || 'basic') : 'free'

          // trial_end を期限目安として保存（新Stripe SDKではcurrent_period_endが直接存在しない）
          const expiresAt = subscription.trial_end || subscription.cancel_at
          await supabase
            .from('clinics')
            .update({
              plan,
              stripe_subscription_id: subscription.id,
              plan_expires_at: expiresAt
                ? new Date(expiresAt * 1000).toISOString()
                : null,
            })
            .eq('id', clinicId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const clinicId = subscription.metadata?.clinic_id

        if (clinicId) {
          await supabase
            .from('clinics')
            .update({
              plan: 'free',
              stripe_subscription_id: null,
              plan_expires_at: null,
            })
            .eq('id', clinicId)
        }
        break
      }
    }
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
