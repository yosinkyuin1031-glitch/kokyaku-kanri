'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import AppShell from '@/components/AppShell'
import { createClient } from '@/lib/supabase/client'
import { findBestMatch, findAllMatches } from '@/lib/nameMatch'
import type { PatientCandidate } from '@/lib/nameMatch'
import { getClinicId } from '@/lib/clinic'

interface ParsedRecord {
  patient_id: string | null
  patient_name: string
  visit_date: string
  menu_name: string
  total_price: number
  payment_method: string
  notes: string
  _candidates?: { patient: PatientCandidate; score: number }[]  // 候補リスト
  _showCandidates?: boolean  // 候補表示中かどうか
}

export default function QuickInputPage() {
  const supabase = createClient()
  const clinicId = getClinicId()
  const router = useRouter()
  const [inputText, setInputText] = useState('')
  const [records, setRecords] = useState<ParsedRecord[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const [allPatients, setAllPatients] = useState<PatientCandidate[]>([])
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // 音声入力
  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      alert('お使いのブラウザは音声入力に対応していません')
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
        setInputText(prev => prev ? prev + '\n' + transcript : transcript)
      }
    }

    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [listening])

  // テキスト解析
  const handleParse = async () => {
    if (!inputText.trim()) return
    setParsing(true)
    setError('')
    setRecords([])

    try {
      // 患者リストを先に取得（候補表示用）
      const { data: pts } = await supabase.from('cm_patients').select('id, name, furigana').eq('clinic_id', clinicId).order('name')
      const candidates = (pts || []).map(p => ({ id: p.id, name: p.name, furigana: p.furigana }))
      setAllPatients(candidates)

      const res = await fetch('/api/parse-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '解析に失敗しました')
      } else {
        // 各レコードに候補リストを付与
        const enriched = (data.records || []).map((r: ParsedRecord) => {
          const matches = findAllMatches(r.patient_name, candidates)
          // 候補が2人以上いる場合、または未マッチの場合は候補を表示
          const needSelection = !r.patient_id || matches.length > 1
          return {
            ...r,
            _candidates: matches,
            _showCandidates: needSelection && matches.length > 1,
          }
        })
        setRecords(enriched)
      }
    } catch {
      setError('通信エラーが発生しました')
    }
    setParsing(false)
  }

  // 候補を選択
  const selectCandidate = (idx: number, candidate: PatientCandidate) => {
    setRecords(prev => prev.map((r, i) => i === idx ? {
      ...r,
      patient_id: candidate.id,
      patient_name: candidate.name,
      _showCandidates: false,
    } : r))
  }

  // 患者名を変更したとき候補を再検索
  const updatePatientName = (idx: number, name: string) => {
    const matches = findAllMatches(name, allPatients)
    setRecords(prev => prev.map((r, i) => i === idx ? {
      ...r,
      patient_name: name,
      patient_id: null,
      _candidates: matches,
      _showCandidates: matches.length > 0,
    } : r))
  }

  // 個別レコード編集
  const updateRecord = (idx: number, key: keyof ParsedRecord, value: string | number) => {
    setRecords(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r))
  }

  // レコード削除
  const removeRecord = (idx: number) => {
    setRecords(prev => prev.filter((_, i) => i !== idx))
  }

  // 一括保存
  const handleSave = async () => {
    if (records.length === 0) return
    setSaving(true)

    // patient_idがnullのレコードを保存前に再マッチング
    const { data: allPatients } = await supabase.from('cm_patients').select('id, name, furigana').eq('clinic_id', clinicId)
    const candidates = (allPatients || []).map(p => ({ id: p.id, name: p.name, furigana: p.furigana }))

    const toInsert = records.map(r => {
      let patientId = r.patient_id
      let patientName = r.patient_name

      if (!patientId && patientName) {
        const match = findBestMatch(patientName, candidates)
        if (match) {
          patientId = match.id
          patientName = match.name
        }
      }

      return {
      clinic_id: clinicId,
      patient_id: patientId,
      patient_name: patientName,
      visit_date: r.visit_date,
      menu_name: r.menu_name,
      base_price: r.total_price,
      option_names: '',
      option_price: 0,
      total_price: r.total_price,
      payment_method: r.payment_method,
      staff_name: '',
      duration_minutes: 0,
      notes: r.notes || '',
    }
    })

    const { error: insertError } = await supabase.from('cm_slips').insert(toInsert)

    if (insertError) {
      setError('保存に失敗しました: ' + insertError.message)
    } else {
      // 患者のupdated_atを更新
      const patientIds = [...new Set(records.map(r => r.patient_id).filter(Boolean))]
      for (const pid of patientIds) {
        await supabase.from('cm_patients').update({ updated_at: new Date().toISOString() }).eq('id', pid)
      }
      setSaved(true)
    }
    setSaving(false)
  }

  if (saved) {
    return (
      <AppShell>
        <Header title="一括入力" />
        <div className="px-4 py-16 text-center">
          <div className="text-5xl mb-4">&#10003;</div>
          <p className="font-bold text-lg text-gray-800">{records.length}件 保存しました</p>
          <div className="flex gap-3 justify-center mt-6">
            <button onClick={() => { setSaved(false); setRecords([]); setInputText('') }}
              className="px-6 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-600">
              続けて入力
            </button>
            <button onClick={() => router.push('/')}
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: '#14252A' }}>
              ホームへ
            </button>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Header title="一括入力" />
      <div className="px-4 py-4 max-w-lg mx-auto space-y-4">

        {/* 入力エリア */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <h3 className="font-bold text-gray-800 text-sm">今日の施術内容をまとめて入力</h3>
          <p className="text-xs text-gray-400">
            例：「木美恵子さんが回数券消費、田中太郎さんが整体で8800円現金」
          </p>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="ここにテキストを入力、または音声ボタンで話してください..."
            className="w-full px-3 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#14252A] focus:border-transparent min-h-[120px] resize-y"
            rows={5}
          />

          <div className="flex gap-2">
            {/* 音声入力ボタン */}
            <button
              type="button"
              onClick={toggleVoice}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-bold transition-all ${
                listening
                  ? 'bg-red-500 text-white animate-pulse-ring shadow-lg scale-105'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:shadow-sm'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
              {listening ? '録音中...タップで停止' : '🎙 音声で入力'}
            </button>

            {/* 解析ボタン */}
            <button
              onClick={handleParse}
              disabled={parsing || !inputText.trim()}
              className="flex-1 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
              style={{ background: '#14252A' }}
            >
              {parsing ? '解析中...' : '内容を解析する'}
            </button>
          </div>
        </div>

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* 解析結果 */}
        {records.length > 0 && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-sm font-bold text-blue-800">{records.length}件の施術記録を検出しました</p>
              <p className="text-xs text-blue-600 mt-1">内容を確認して「一括登録」を押してください</p>
            </div>

            <div className="space-y-3">
              {records.map((r, idx) => (
                <div key={idx} className="bg-white rounded-xl shadow-sm p-4 space-y-2 relative">
                  <button onClick={() => removeRecord(idx)}
                    className="absolute top-2 right-2 text-gray-300 hover:text-red-500 text-lg leading-none">&times;</button>

                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">#{idx + 1}</span>
                    {!r.patient_id && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">患者未マッチ</span>
                    )}
                  </div>

                  {/* 患者名 + 候補選択 */}
                  <div className="relative">
                    <label className="block text-[10px] text-gray-400">患者名</label>
                    <div className="flex gap-2 items-center">
                      <input type="text" value={r.patient_name}
                        onChange={e => updatePatientName(idx, e.target.value)}
                        onFocus={() => {
                          if (r._candidates && r._candidates.length > 1) {
                            setRecords(prev => prev.map((rec, i) => i === idx ? { ...rec, _showCandidates: true } : rec))
                          }
                        }}
                        className={`flex-1 px-2 py-1.5 border rounded-lg text-sm font-medium ${
                          r.patient_id ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'
                        }`} />
                      {r.patient_id && <span className="text-green-500 text-xs shrink-0">✓ 確定</span>}
                      {!r.patient_id && <span className="text-yellow-600 text-xs shrink-0">要選択</span>}
                    </div>

                    {/* 候補リスト */}
                    {r._showCandidates && r._candidates && r._candidates.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        <div className="px-3 py-1.5 bg-gray-50 border-b">
                          <p className="text-[10px] text-gray-500 font-bold">候補を選択してください（{r._candidates.length}件）</p>
                        </div>
                        {r._candidates.map((c, ci) => (
                          <button key={ci}
                            onClick={() => selectCandidate(idx, c.patient)}
                            className={`w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 flex items-center justify-between ${
                              r.patient_id === c.patient.id ? 'bg-green-50' : ''
                            }`}>
                            <div>
                              <span className="text-sm font-medium">{c.patient.name}</span>
                              {c.patient.furigana && <span className="text-xs text-gray-400 ml-2">{c.patient.furigana}</span>}
                            </div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              c.score >= 90 ? 'bg-green-100 text-green-700' :
                              c.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {c.score >= 90 ? '高一致' : c.score >= 60 ? '中一致' : '低一致'}
                            </span>
                          </button>
                        ))}
                        <button onClick={() => setRecords(prev => prev.map((rec, i) => i === idx ? { ...rec, _showCandidates: false } : rec))}
                          className="w-full text-center py-1.5 text-xs text-gray-400 hover:bg-gray-50">
                          閉じる
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* 来店日 */}
                    <div>
                      <label className="block text-[10px] text-gray-400">来店日</label>
                      <input type="date" value={r.visit_date}
                        onChange={e => updateRecord(idx, 'visit_date', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                    </div>

                    {/* 金額 */}
                    <div>
                      <label className="block text-[10px] text-gray-400">金額</label>
                      <input type="number" value={r.total_price}
                        onChange={e => updateRecord(idx, 'total_price', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-bold" />
                    </div>

                    {/* メニュー */}
                    <div>
                      <label className="block text-[10px] text-gray-400">メニュー</label>
                      <input type="text" value={r.menu_name}
                        onChange={e => updateRecord(idx, 'menu_name', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                    </div>

                    {/* 支払方法 */}
                    <div>
                      <label className="block text-[10px] text-gray-400">支払方法</label>
                      <input type="text" value={r.payment_method}
                        onChange={e => updateRecord(idx, 'payment_method', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>

                  {/* サマリー */}
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                    {r.patient_name} / {r.menu_name} / <span className="font-bold">{r.total_price.toLocaleString()}円</span> / {r.payment_method}
                  </div>
                </div>
              ))}
            </div>

            {/* 一括登録ボタン */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full text-white py-4 rounded-xl font-bold text-base disabled:opacity-50 shadow-lg transition-all active:scale-95"
              style={{ background: '#14252A' }}
            >
              {saving ? '保存中...' : `${records.length}件を一括登録する`}
            </button>
          </>
        )}
      </div>
    </AppShell>
  )
}
