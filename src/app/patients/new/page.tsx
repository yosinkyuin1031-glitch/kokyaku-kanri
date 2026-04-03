'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { useToast } from '@/components/Toast'
import { createClient } from '@/lib/supabase/client'
import { getClinicId } from '@/lib/clinic'
import { PREFECTURES } from '@/lib/types'

export default function NewPatientPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const router = useRouter()
  const { showToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [listening, setListening] = useState(false)
  const [parseError, setParseError] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [form, setForm] = useState({
    name: '', furigana: '', birth_date: '', gender: '男性',
    phone: '', email: '',
    zipcode: '', prefecture: '', city: '', address: '', building: '',
    occupation: '',
    referral_source: '', visit_motive: '', customer_category: '',
    chief_complaint: '', medical_history: '', notes: '',
    is_direct_mail: true, is_enabled: true,
  })

  // マスターデータ取得
  const [occupations, setOccupations] = useState<string[]>([])
  const [visitMotives, setVisitMotives] = useState<string[]>([])
  const [symptoms, setSymptoms] = useState<string[]>([])

  useEffect(() => {
    const loadMasters = async () => {
      const [occRes, motRes, symRes] = await Promise.all([
        supabase.from('cm_occupations').select('name').eq('clinic_id', clinicId).eq('is_active', true).order('sort_order'),
        supabase.from('cm_visit_motives').select('name').eq('clinic_id', clinicId).eq('is_active', true).order('sort_order'),
        supabase.from('cm_symptoms').select('name').eq('clinic_id', clinicId).eq('is_active', true).order('sort_order'),
      ])
      setOccupations((occRes.data || []).map(r => r.name))
      setVisitMotives((motRes.data || []).map(r => r.name))
      setSymptoms((symRes.data || []).map(r => r.name))
    }
    loadMasters()
  }, [])

  const update = (key: string, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }))

  // 音声入力
  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      showToast('お使いのブラウザは音声入力に対応していません', 'error')
      return
    }

    const recognition = new SR()
    recognition.lang = 'ja-JP'
    recognition.continuous = true
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript
        }
      }
      if (transcript) {
        setVoiceText(prev => prev ? prev + '\n' + transcript : transcript)
      }
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [listening])

  // AI解析して各項目に自動振り分け
  const handleParse = async () => {
    if (!voiceText.trim()) return
    setParsing(true)
    setParseError('')

    try {
      const res = await fetch('/api/parse-patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: voiceText }),
      })
      const data = await res.json()

      if (!res.ok) {
        setParseError(data.error || '解析に失敗しました')
      } else if (data.patient) {
        const p = data.patient
        setForm(prev => ({
          ...prev,
          name: p.name || prev.name,
          furigana: p.furigana || prev.furigana,
          birth_date: p.birth_date || prev.birth_date,
          gender: p.gender || prev.gender,
          phone: p.phone || prev.phone,
          email: p.email || prev.email,
          zipcode: p.zipcode || prev.zipcode,
          prefecture: p.prefecture || prev.prefecture,
          city: p.city || prev.city,
          address: p.address || prev.address,
          building: p.building || prev.building,
          occupation: p.occupation || prev.occupation,
          referral_source: p.referral_source || prev.referral_source,
          chief_complaint: p.chief_complaint || prev.chief_complaint,
          medical_history: p.medical_history || prev.medical_history,
        }))
      }
    } catch {
      setParseError('通信エラーが発生しました')
    }
    setParsing(false)
  }

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    const { error } = await supabase.from('cm_patients').insert({
      ...form,
      status: 'active',
      clinic_id: clinicId,
    })
    if (!error) {
      setSaved(true)
      setTimeout(() => router.push('/patients'), 800)
    }
    setSaving(false)
  }

  const inputClass = "w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A] focus:border-transparent"

  if (saved) {
    return (
      <AppShell>
        <Header title="新規患者登録" />
        <div className="px-4 py-16 text-center">
          <div className="text-5xl mb-4">&#10003;</div>
          <p className="font-bold text-lg text-gray-800">登録しました</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Header title="新規患者登録" />
      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">

        {/* 音声一括入力エリア */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="font-bold text-gray-800 text-sm">まとめて音声入力</h3>
          <p className="text-xs text-gray-500">
            例:「山田花子さん、やまだはなこ、女性、昭和55年6月10日生まれ、電話番号090-1234-5678、大阪府住吉区長居、腰痛と肩こりで来院、Googleマップで検索して来ました、職業は主婦です」
          </p>

          <textarea
            value={voiceText}
            onChange={(e) => setVoiceText(e.target.value)}
            placeholder="ここにテキスト入力、または音声ボタンで話してください..."
            className="w-full px-3 py-3 border border-blue-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A] min-h-[80px] resize-y bg-white"
            rows={3}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleVoice}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                listening
                  ? 'bg-red-500 text-white animate-pulse shadow-lg'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
              {listening ? '録音中...' : '音声入力'}
            </button>

            <button
              onClick={handleParse}
              disabled={parsing || !voiceText.trim()}
              className="flex-1 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
              style={{ background: '#14252A' }}
            >
              {parsing ? '解析中...' : '各項目に自動反映'}
            </button>
          </div>

          {parseError && (
            <p className="text-xs text-red-600">{parseError}</p>
          )}
        </div>

        {/* 基本情報 */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <h3 className="font-bold text-gray-800 text-sm border-b pb-2">基本情報</h3>

          <div>
            <label className="block text-xs text-gray-600 mb-1">氏名 *</label>
            <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} className={inputClass} placeholder="山田 太郎" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">ふりがな</label>
            <input type="text" value={form.furigana} onChange={(e) => update('furigana', e.target.value)} className={inputClass} placeholder="ヤマダ タロウ" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">生年月日</label>
              <input type="date" value={form.birth_date} onChange={(e) => update('birth_date', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">性別</label>
              <select value={form.gender} onChange={(e) => update('gender', e.target.value)} className={inputClass}>
                <option>男性</option>
                <option>女性</option>
                <option>その他</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">電話番号</label>
              <input type="tel" value={form.phone} onChange={(e) => {
                const v = e.target.value.replace(/[^\d-]/g, '')
                // 自動ハイフン挿入
                const digits = v.replace(/-/g, '')
                let formatted = digits
                if (digits.length >= 4 && digits.length <= 7) {
                  formatted = digits.slice(0, 3) + '-' + digits.slice(3)
                } else if (digits.length >= 8) {
                  formatted = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11)
                }
                update('phone', formatted)
              }} className={inputClass} placeholder="090-XXXX-XXXX" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">メールアドレス</label>
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} className={inputClass} placeholder="example@email.com" />
            </div>
          </div>
        </div>

        {/* 住所 */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <h3 className="font-bold text-gray-800 text-sm border-b pb-2">住所</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">郵便番号</label>
              <input type="text" value={form.zipcode} onChange={(e) => update('zipcode', e.target.value)} className={inputClass} placeholder="000-0000" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">都道府県</label>
              <select value={form.prefecture} onChange={(e) => update('prefecture', e.target.value)} className={inputClass}>
                <option value="">選択</option>
                {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">市区町村</label>
            <input type="text" value={form.city} onChange={(e) => update('city', e.target.value)} className={inputClass} placeholder="住吉区長居" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">番地</label>
            <input type="text" value={form.address} onChange={(e) => update('address', e.target.value)} className={inputClass} placeholder="1-2-3" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">建物名・部屋番号</label>
            <input type="text" value={form.building} onChange={(e) => update('building', e.target.value)} className={inputClass} placeholder="○○マンション101" />
          </div>
        </div>

        {/* 来院情報 */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <h3 className="font-bold text-gray-800 text-sm border-b pb-2">来院情報</h3>

          <div>
            <label className="block text-xs text-gray-600 mb-1">職業</label>
            <select value={form.occupation} onChange={(e) => update('occupation', e.target.value)} className={inputClass}>
              <option value="">選択してください</option>
              {occupations.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">来院経路</label>
            <select value={form.referral_source} onChange={(e) => update('referral_source', e.target.value)} className={inputClass}>
              <option value="">選択してください</option>
              {visitMotives.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">主訴（お困りの症状）</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {symptoms.map(s => {
                const selected = form.chief_complaint.split(/[,、\s]+/).map(v => v.trim()).filter(Boolean).includes(s)
                return (
                  <button key={s} type="button" onClick={() => {
                    const current = form.chief_complaint.split(/[,、\s]+/).map(v => v.trim()).filter(Boolean)
                    const next = selected ? current.filter(v => v !== s) : [...current, s]
                    update('chief_complaint', next.join('、'))
                  }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      selected ? 'bg-[#14252A] text-white border-[#14252A]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >{s}</button>
                )
              })}
            </div>
            <input type="text" value={form.chief_complaint} onChange={(e) => update('chief_complaint', e.target.value)} className={inputClass} placeholder="上記から選択、または直接入力" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">既往歴</label>
            <textarea value={form.medical_history} onChange={(e) => update('medical_history', e.target.value)} className={inputClass} rows={2} placeholder="手術歴、持病など" />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">メモ</label>
            <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} className={inputClass} rows={2} placeholder="注意点など" />
          </div>

          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_direct_mail} onChange={e => update('is_direct_mail', e.target.checked)} className="rounded" />
              DM送付可
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_enabled} onChange={e => update('is_enabled', e.target.checked)} className="rounded" />
              有効
            </label>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !form.name}
          className="w-full text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50 shadow-lg transition-all active:scale-95"
          style={{ background: '#14252A' }}
        >
          {saving ? '登録中...' : '患者を登録する'}
        </button>
      </div>
    </AppShell>
  )
}
