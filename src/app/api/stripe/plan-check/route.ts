import { NextRequest, NextResponse } from 'next/server'
import { checkPlanLimit } from '@/lib/plan'

export async function POST(req: NextRequest) {
  try {
    const { clinicId } = await req.json()

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicIdは必須です' }, { status: 400 })
    }

    const result = await checkPlanLimit(clinicId)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Plan check error:', error)
    return NextResponse.json(
      { error: 'プラン確認に失敗しました' },
      { status: 500 }
    )
  }
}
