'use client'

import { useState, useRef, useCallback } from 'react'

interface VoiceInputProps {
  onResult: (text: string) => void
  className?: string
  size?: 'sm' | 'md'
}

export default function VoiceInput({ onResult, className = '', size = 'md' }: VoiceInputProps) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('お使いのブラウザは音声入力に対応していません。Chrome or Safariをお使いください。')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'ja-JP'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0][0].transcript
      onResult(text)
      setListening(false)
    }

    recognition.onerror = () => {
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [listening, onResult])

  const sizeClass = size === 'sm' ? 'w-9 h-9 text-base' : 'w-11 h-11 text-lg'

  return (
    <button
      type="button"
      onClick={toggle}
      className={`${sizeClass} rounded-full flex items-center justify-center transition-all ${
        listening
          ? 'bg-red-500 text-white animate-pulse shadow-lg'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      } ${className}`}
      title={listening ? '停止' : '音声入力'}
    >
      {listening ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
      )}
    </button>
  )
}
