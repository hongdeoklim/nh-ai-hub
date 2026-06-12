import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  WebSpeechRecognitionCtor,
  WebSpeechRecognitionErrorEvent,
  WebSpeechRecognitionInstance,
  WebSpeechRecognitionResultEvent,
} from '../types/web-speech'

function getSpeechRecognitionCtor(): WebSpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window &
    typeof globalThis & {
      SpeechRecognition?: WebSpeechRecognitionCtor
      webkitSpeechRecognition?: WebSpeechRecognitionCtor
    }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function mapSpeechRecognitionError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크를 허용해 주세요.'
    case 'no-speech':
      return '말이 감지되지 않았습니다. 다시 시도해 주세요.'
    case 'audio-capture':
      return '마이크를 사용할 수 없습니다. 다른 앱이 점유 중인지 확인해 주세요.'
    case 'network':
      return '음성 인식 서비스에 연결할 수 없습니다. 네트워크를 확인해 주세요.'
    case 'aborted':
      return '음성 입력이 중지되었습니다.'
    default:
      return `음성 인식 오류: ${code}`
  }
}

export type UseSpeechRecognitionOptions = {
  /** 음성 인식 오류 시 호출 (미지원 브라우저는 호출되지 않음) */
  onError?: (message: string) => void
}

export type UseSpeechRecognitionReturn = {
  isSupported: boolean
  isListening: boolean
  transcript: string
  error: string | null
  startListening: () => void
  stopListening: () => void
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionReturn {
  const { onError } = options

  const speechCtor = useMemo(() => getSpeechRecognitionCtor(), [])
  const isSupported = speechCtor !== null

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<WebSpeechRecognitionInstance | null>(null)
  const sessionFinalRef = useRef('')
  const suppressErrorRef = useRef(false)
  const wantsListeningRef = useRef(false)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const stopListening = useCallback(() => {
    wantsListeningRef.current = false
    suppressErrorRef.current = true
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setIsListening(false)
  }, [])

  const bindRecognition = useCallback(
    (recognition: WebSpeechRecognitionInstance) => {
      recognition.lang = 'ko-KR'
      recognition.continuous = true
      recognition.interimResults = true

      recognition.onresult = (event: WebSpeechRecognitionResultEvent) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (!result) continue
          const piece = result[0]?.transcript ?? ''
          if (result.isFinal) {
            sessionFinalRef.current += piece
          } else {
            interim += piece
          }
        }
        setTranscript(`${sessionFinalRef.current}${interim}`.trim())
      }

      recognition.onerror = (event: WebSpeechRecognitionErrorEvent) => {
        if (suppressErrorRef.current) return
        if (event.error === 'aborted') return
        if (event.error === 'no-speech') return

        const message = mapSpeechRecognitionError(event.error)
        setError(message)
        onErrorRef.current?.(message)
        wantsListeningRef.current = false
        setIsListening(false)
        recognitionRef.current = null
      }

      recognition.onend = () => {
        if (wantsListeningRef.current && recognitionRef.current) {
          try {
            recognitionRef.current.start()
            return
          } catch {
            wantsListeningRef.current = false
          }
        }
        setIsListening(false)
        recognitionRef.current = null
      }
    },
    [],
  )

  const startListening = useCallback(() => {
    if (!speechCtor) {
      const message =
        '이 브라우저는 음성 입력(Web Speech API)을 지원하지 않습니다. Chrome 또는 Edge를 사용해 주세요.'
      setError(message)
      onErrorRef.current?.(message)
      return
    }

    if (recognitionRef.current) return

    suppressErrorRef.current = false
    wantsListeningRef.current = true
    sessionFinalRef.current = ''
    setTranscript('')
    setError(null)

    const recognition = new speechCtor()
    bindRecognition(recognition)
    recognitionRef.current = recognition
    setIsListening(true)

    try {
      recognition.start()
    } catch {
      wantsListeningRef.current = false
      recognitionRef.current = null
      setIsListening(false)
      const message = '음성 입력을 시작할 수 없습니다.'
      setError(message)
      onErrorRef.current?.(message)
    }
  }, [bindRecognition, speechCtor])

  useEffect(() => {
    return () => {
      wantsListeningRef.current = false
      suppressErrorRef.current = true
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [])

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
  }
}
