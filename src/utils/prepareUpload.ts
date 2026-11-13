/**
 * Gets a file from a phone into a state the evidence store accepts.
 *
 * Three things went wrong with photographs taken on a phone and uploaded as they
 * came off the camera:
 *  - **Size.** A modern phone photo is 3–12 MB. Over a restaurant's mobile
 *    signal that is a long wait with nothing on screen, and it multiplies the
 *    storage bill by ten for no gain a report can show.
 *  - **Format.** iPhones save HEIC. The bucket takes JPEG, PNG and WebP, and no
 *    browser except Safari can even display HEIC, so it was refused.
 *  - **No type at all.** Some Android browsers hand over a file with an empty
 *    `type`, which the upload then rejected as "unsupported".
 *
 * Photographs are therefore redrawn as JPEG, at most 2048 px on the long side,
 * in the browser before they leave the phone — a few hundred kilobytes, readable
 * everywhere, and with the location metadata a camera embeds stripped as a side
 * effect. Videos and PDFs are passed through with their type filled in.
 */

const MAX_EDGE = 2048
const JPEG_QUALITY = 0.82
/** Small, already-web-friendly photographs are left exactly as taken. */
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  pdf: 'application/pdf',
}

/** The file's media type, falling back to its extension when the browser gave none. */
export function mediaTypeOf(file: File): string {
  if (file.type) return file.type.toLowerCase()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return TYPE_BY_EXTENSION[ext] ?? ''
}

const isHeic = (type: string) => type === 'image/heic' || type === 'image/heif'
const WEB_IMAGES = ['image/jpeg', 'image/png', 'image/webp']

function baseName(name: string) {
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name) || 'photo'
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      /* fall through to <img>, which Safari can use for HEIC */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

async function toJpeg(file: File): Promise<File> {
  const img = await decode(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    // A transparent PNG would turn black as JPEG; give it the white of a page.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img.source, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob) throw new Error('Could not encode the photo')
    return new File([blob], `${baseName(file.name)}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
  } finally {
    img.close()
  }
}

/**
 * Returns the file to upload, or throws a message a shopper can act on.
 */
export async function prepareUpload(file: File): Promise<File> {
  const type = mediaTypeOf(file)

  if (type.startsWith('image/')) {
    if (WEB_IMAGES.includes(type) && file.size <= KEEP_AS_IS_BYTES) {
      return file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified })
    }
    try {
      return await toJpeg(file)
    } catch {
      if (WEB_IMAGES.includes(type) && file.size <= MAX_UPLOAD_BYTES) {
        return file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified })
      }
      if (isHeic(type)) {
        throw new Error(
          'This photo is in HEIC format, which this browser cannot convert. Use "Take photo" to capture it directly, or on iPhone set Settings → Camera → Formats → Most Compatible.',
        )
      }
      throw new Error('This photo could not be read. Try taking it again.')
    }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(0)
    throw new Error(`This file is ${mb} MB; the limit is 50 MB. Record a shorter clip.`)
  }
  return file.type === type || !type ? file : new File([file], file.name, { type, lastModified: file.lastModified })
}
