/**
 * Web Speech API (벤더 프리픽스 포함) — 환경에 따라 TS DOM 전역과 불일치할 수 있어 최소 형태만 둡니다.
 */
export type WebSpeechRecognitionResultList = {
  readonly length: number
  [index: number]: {
    readonly isFinal: boolean
    readonly 0?: { readonly transcript: string }
  }
}

export type WebSpeechRecognitionResultEvent = {
  readonly resultIndex: number
  readonly results: WebSpeechRecognitionResultList
}

export type WebSpeechRecognitionErrorEvent = {
  readonly error: string
}

export type WebSpeechRecognitionInstance = EventTarget & {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  abort(): void
  onresult: ((this: WebSpeechRecognitionInstance, ev: WebSpeechRecognitionResultEvent) => void) | null
  onerror: ((this: WebSpeechRecognitionInstance, ev: WebSpeechRecognitionErrorEvent) => void) | null
  onend: ((this: WebSpeechRecognitionInstance, ev: Event) => void) | null
}

export type WebSpeechRecognitionCtor = new () => WebSpeechRecognitionInstance
