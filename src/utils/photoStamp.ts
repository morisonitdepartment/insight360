/**
 * The date, time and position a camera wrote into a photo (EXIF), read before
 * the photo is shrunk for upload — re-encoding throws that information away.
 *
 * The briefs want the proof-of-visit photo to show the visit's date, time and
 * place. Nothing can read a stamp drawn onto the picture, but phone cameras
 * record the same facts inside the file, and that the platform can check: the
 * reviewer sees when and where the photo was really taken, and is warned when
 * it was taken on another day, hours from the visit, or carries no camera data
 * at all (a screenshot, or a photo passed through a messaging app).
 *
 * JPEG only. iPhone HEIC is refused at upload anyway; PNG and WebP rarely carry
 * EXIF. Anything unreadable simply returns nothing — never an error.
 */

export interface PhotoStamp {
  /** Local wall-clock time the photo was taken, `yyyy-MM-ddTHH:mm:ss`. */
  takenAt: string | null
  latitude: number | null
  longitude: number | null
}

const NONE: PhotoStamp = { takenAt: null, latitude: null, longitude: null }

export async function readPhotoStamp(file: File | Blob | null | undefined): Promise<PhotoStamp> {
  if (!file) return NONE
  try {
    // EXIF sits at the start of the file; 256 KB covers it with room to spare.
    const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer())
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return NONE
    let offset = 2
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset)
      const size = view.getUint16(offset + 2)
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) return parseExif(view, offset + 10)
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break
      offset += 2 + size
    }
  } catch {
    /* an unreadable header is the same as no stamp */
  }
  return NONE
}

function parseExif(view: DataView, tiff: number): PhotoStamp {
  const little = view.getUint16(tiff) === 0x4949
  const u16 = (o: number) => view.getUint16(o, little)
  const u32 = (o: number) => view.getUint32(o, little)

  /** Entries of the IFD at `ifd` (offset from the TIFF header) as tag → entry offset. */
  const entries = (ifd: number) => {
    const out = new Map<number, number>()
    const start = tiff + ifd
    if (start + 2 > view.byteLength) return out
    const n = u16(start)
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12
      if (e + 12 > view.byteLength) break
      out.set(u16(e), e)
    }
    return out
  }
  const ascii = (e: number) => {
    const count = u32(e + 4)
    const at = count > 4 ? tiff + u32(e + 8) : e + 8
    let s = ''
    for (let i = 0; i < count - 1 && at + i < view.byteLength; i++) s += String.fromCharCode(view.getUint8(at + i))
    return s
  }
  const rationals = (e: number) => {
    const count = u32(e + 4)
    const at = tiff + u32(e + 8)
    const out: number[] = []
    for (let i = 0; i < count; i++) {
      const den = u32(at + i * 8 + 4)
      out.push(den ? u32(at + i * 8) / den : 0)
    }
    return out
  }

  const ifd0 = entries(u32(tiff + 4))
  let takenAt: string | null = null
  const exifPtr = ifd0.get(0x8769)
  if (exifPtr !== undefined) {
    const exif = entries(u32(exifPtr + 8))
    const original = exif.get(0x9003) ?? exif.get(0x9004)
    if (original !== undefined) takenAt = toIso(ascii(original))
  }
  if (!takenAt && ifd0.has(0x0132)) takenAt = toIso(ascii(ifd0.get(0x0132)!))

  let latitude: number | null = null
  let longitude: number | null = null
  const gpsPtr = ifd0.get(0x8825)
  if (gpsPtr !== undefined) {
    const gps = entries(u32(gpsPtr + 8))
    const lat = gps.get(2)
    const lng = gps.get(4)
    if (lat !== undefined && lng !== undefined) {
      const dms = (v: number[]) => (v[0] ?? 0) + (v[1] ?? 0) / 60 + (v[2] ?? 0) / 3600
      const latRef = gps.has(1) ? ascii(gps.get(1)!) : 'N'
      const lngRef = gps.has(3) ? ascii(gps.get(3)!) : 'E'
      const la = dms(rationals(lat)) * (latRef === 'S' ? -1 : 1)
      const lo = dms(rationals(lng)) * (lngRef === 'W' ? -1 : 1)
      // 0,0 is what some apps write when they have no fix.
      if (Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0)) {
        latitude = Math.round(la * 1e6) / 1e6
        longitude = Math.round(lo * 1e6) / 1e6
      }
    }
  }
  return { takenAt, latitude, longitude }
}

/** EXIF writes `2026:11:14 10:42:07` in the camera's local time. */
function toIso(raw: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim())
  if (!m || m[1] === '0000') return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
}
