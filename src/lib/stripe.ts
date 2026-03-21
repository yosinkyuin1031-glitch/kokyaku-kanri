import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
})

// 料金プラン定義
export const PLAN_PRICES = {
  basic: {
    name: 'ベーシック',
    price: 4980,
    description: '患者数無制限・全機能利用可能',
  },
  pro: {
    name: 'プロ',
    price: 9800,
    description: '複数スタッフ・API連携等（準備中）',
  },
} as const

export type PlanType = 'free' | 'basic' | 'pro'
