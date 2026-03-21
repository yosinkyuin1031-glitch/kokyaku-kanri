import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEYが設定されていません' }, { status: 500 })
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `あなたは整体院の受付アシスタントです。
以下のテキストから新規患者の情報を抽出してJSONで返してください。

【抽出する項目】
- name: 氏名（漢字）
- furigana: ふりがな（ひらがな）
- birth_date: 生年月日（YYYY-MM-DD形式。和暦の場合は西暦に変換）
- gender: 性別（男性/女性/その他）
- phone: 電話番号（ハイフン付き）
- email: メールアドレス
- zipcode: 郵便番号
- prefecture: 都道府県
- city: 市区町村
- address: 番地
- building: 建物名・部屋番号
- occupation: 職業
- referral_source: 来院経路（以下から最も近いもの: Google検索, Googleマップ, Instagram, YouTube, チラシ, 紹介, LINE, 通りがかり, HP, その他）
- chief_complaint: 主訴（お困りの症状）
- medical_history: 既往歴

【和暦変換ルール】
- 令和元年=2019, 令和2年=2020, ...
- 平成元年=1989, 平成31年=2019
- 昭和元年=1926, 昭和64年=1989

【ルール】
- テキストに含まれない項目は空文字""にする
- 推測で埋めない。明確に言及されている情報のみ
- JSONのみ返す。説明文不要

【入力テキスト】
${text}`
        }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      return NextResponse.json({ error: '解析に失敗しました' }, { status: 500 })
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: '解析結果を読み取れませんでした' }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({ patient: parsed })
  } catch (error) {
    console.error('Parse error:', error)
    return NextResponse.json({ error: '解析中にエラーが発生しました' }, { status: 500 })
  }
}
