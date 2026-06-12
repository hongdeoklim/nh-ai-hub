/** 채팅 첨부용 이미지 압축 — 최대 1024px, 1MB 미만 JPEG Base64 */

const MAX_DIMENSION = 1024
const MAX_BYTES = 1024 * 1024

export type CompressedChatImage = {
  /** data: 접두사 없는 순수 Base64 */
  imageBase64: string
  mimeType: 'image/jpeg' | 'image/png'
  /** 미리보기용 Data URL */
  previewDataUrl: string
  fileName: string
}

function isAllowedImageFile(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === 'image/jpeg' || type === 'image/png') return true
  const name = file.name.toLowerCase()
  return /\.(jpe?g|png)$/.test(name)
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러올 수 없습니다.'))
    }
    img.src = url
  })
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Base64 변환 실패'))
        return
      }
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Base64 변환 실패'))
    reader.readAsDataURL(blob)
  })
}

/**
 * JPG/PNG 파일을 Canvas 로 리사이즈·JPEG 압축 후 Base64 로 반환합니다.
 * 실패 시 null (지원 형식 아님·디코드 실패 등).
 */
export async function compressChatImageFile(
  file: File,
): Promise<CompressedChatImage | null> {
  if (!isAllowedImageFile(file)) return null

  let img: HTMLImageElement
  try {
    img = await loadImageFromFile(file)
  } catch {
    return null
  }

  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) return null

  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, tw, th)

  let quality = 0.7
  let blob: Blob | null = null
  while (quality >= 0.45) {
    blob = await canvasToJpegBlob(canvas, quality)
    if (!blob) break
    if (blob.size < MAX_BYTES) break
    quality -= 0.08
  }

  if (!blob || blob.size >= MAX_BYTES) {
    blob = await canvasToJpegBlob(canvas, 0.4)
    if (!blob || blob.size >= MAX_BYTES) return null
  }

  const imageBase64 = await blobToBase64(blob)
  const previewDataUrl = `data:image/jpeg;base64,${imageBase64}`
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
  return {
    imageBase64,
    mimeType: 'image/jpeg',
    previewDataUrl,
    fileName: `${baseName}.jpg`,
  }
}
