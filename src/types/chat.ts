/** Edge `ai-chat` 및 클라이언트 입력과 공유하는 채팅 페이로드 타입 */

import type { ComposerToolMode } from './composer-tools'

export type ChatExperimentalAttachment = {
  /** Data URL (`data:image/...;base64,...`) — JSON 레거시 경로 전용 */
  url: string
  contentType?: string
  name?: string
}

export type ChatSendPayload = {
  text: string
  /** Vision 요청용 압축 이미지 (순수 Base64, data: 접두사 없음) */
  imageBase64?: string
  mimeType?: string
  /** @deprecated multipart 경로 — 신규 UI는 `imageBase64` + `mimeType` 사용 */
  imageFiles?: File[]
  /** 레거시: JSON + Data URL (로컬/API 테스트용) */
  experimental_attachments?: ChatExperimentalAttachment[]
  /** 도구 메뉴: 이미지·동영상·Canvas·음성 */
  composerTool?: ComposerToolMode | null
}
