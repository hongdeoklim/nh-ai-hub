type GeminiChatBackgroundProps = {
  /** 답변 생성 중 — 그라데이션 오브 애니메이션 강화 */
  active?: boolean
}

export function GeminiChatBackground({ active = false }: GeminiChatBackgroundProps) {
  return (
    <div
      className={`gemini-lm-background pointer-events-none absolute inset-0 -z-10 overflow-hidden ${
        active ? 'gemini-lm-background--generating' : ''
      }`}
      aria-hidden
    >
      <div className="gemini-lm-background__base" />
      <div className="gemini-lm-background__orb gemini-lm-background__orb--blue" />
      <div className="gemini-lm-background__orb gemini-lm-background__orb--indigo" />
      <div className="gemini-lm-background__orb gemini-lm-background__orb--violet" />
      <div className="gemini-lm-background__orb gemini-lm-background__orb--cyan" />
      <div className="gemini-lm-background__mesh" />
    </div>
  )
}
