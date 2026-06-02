import * as tus from 'tus-js-client'
import { getSupabase } from './supabase'

const BUCKET = 'bsi-website'

/**
 * Resumable (TUS) upload for large files (videos > 50 MB).
 *
 * Single-shot POST uploads are capped at 50 MB on the Supabase
 * free tier — anything bigger errors out with "exceeded the
 * maximum allowed size". Resumable uploads bypass that cap (up
 * to 5 GB per file on free tier, 50 GB on Pro) by chunking the
 * file and sending each chunk via the TUS protocol.
 *
 * Returns the same `{ promise, abort }` shape as
 * `uploadFileWithProgress` so callers can swap implementations
 * without touching their state-machine logic.
 */
export function uploadFileResumable(
  file: File,
  prefix: string,
  onProgress: (p: UploadProgress) => void,
): { promise: Promise<UploadResult>; abort: () => void } {
  const supabase = getSupabase()
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const safePrefix = prefix.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'misc'
  const stamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const path = `${safePrefix}/${stamp}-${random}.${ext}`

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  let upload: tus.Upload | null = null
  let cancelled = false

  const promise = new Promise<UploadResult>((resolve, reject) => {
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return
        const token = data.session?.access_token ?? anonKey

        // Speed/progress tracking (mirrors uploadFileWithProgress)
        let sampleTime = Date.now()
        let sampleLoaded = 0
        let smoothedSpeed = 0

        upload = new tus.Upload(file, {
          // Supabase's resumable upload endpoint speaks TUS.
          endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${token}`,
            'x-upsert': 'false',
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: BUCKET,
            objectName: path,
            contentType: file.type || 'application/octet-stream',
            cacheControl: '3600',
          },
          // 6 MB chunks — well under the 50 MB single-POST cap,
          // big enough to keep round-trip overhead low.
          chunkSize: 6 * 1024 * 1024,
          onError(error) {
            // eslint-disable-next-line no-console
            console.error('[upload-resumable] error', error)
            reject(new Error(error.message || 'Upload gagal'))
          },
          onProgress(bytesUploaded, bytesTotal) {
            const now = Date.now()
            const dt = (now - sampleTime) / 1000
            if (dt >= 0.5) {
              const instant = (bytesUploaded - sampleLoaded) / dt
              smoothedSpeed = smoothedSpeed === 0 ? instant : 0.4 * instant + 0.6 * smoothedSpeed
              sampleTime = now
              sampleLoaded = bytesUploaded
            }
            onProgress({
              loaded: bytesUploaded,
              total: bytesTotal,
              percent: bytesTotal > 0 ? (bytesUploaded / bytesTotal) * 100 : 0,
              speed: smoothedSpeed,
            })
          },
          onSuccess() {
            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
            resolve({
              url: pub.publicUrl,
              path,
              size: file.size,
              type: file.type,
            })
          },
        })

        upload.start()
      })
      .catch((err) => reject(err))
  })

  return {
    promise,
    abort: () => {
      cancelled = true
      if (upload) void upload.abort()
    },
  }
}

export interface UploadResult {
  url: string
  path: string
  size: number
  type: string
}

/**
 * Upload a single file to Supabase Storage and return its public URL.
 * `prefix` controls the folder, e.g. 'hero', 'portfolio', 'team'.
 */
export async function uploadFile(file: File, prefix: string): Promise<UploadResult> {
  const supabase = getSupabase()

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const safePrefix = prefix.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'misc'
  const stamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const path = `${safePrefix}/${stamp}-${random}.${ext}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return {
    url: data.publicUrl,
    path,
    size: file.size,
    type: file.type,
  }
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
  /** Bytes per second over the last sample window. */
  speed: number
}

/**
 * Upload a file and report real-time progress. Uses XMLHttpRequest under the
 * hood (fetch has no upload progress events) and posts directly to the
 * Supabase Storage REST endpoint with the same auth token the JS client uses.
 *
 * Returns an object with the resulting upload + an `abort()` you can call to
 * cancel the request mid-flight.
 */
/** Hard server-side bucket limit (`file_size_limit` on bsi-website). */
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

/** Whitelist of MIME types the bucket accepts. Updating this requires a
 *  matching change to the bucket's `allowed_mime_types` column in Supabase. */
const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

export function uploadFileWithProgress(
  file: File,
  prefix: string,
  onProgress: (p: UploadProgress) => void,
): { promise: Promise<UploadResult>; abort: () => void } {
  const supabase = getSupabase()
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const safePrefix = prefix.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'misc'
  const stamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const path = `${safePrefix}/${stamp}-${random}.${ext}`

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${encodeURI(path)}`

  const xhr = new XMLHttpRequest()

  const promise = new Promise<UploadResult>((resolve, reject) => {
    // Pre-checks — fail loudly here instead of letting the browser pop a
    // generic "Network error" when the server rejects the upload.
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(
        new Error(
          `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB.`,
        ),
      )
      return
    }
    if (file.type && !ALLOWED_UPLOAD_MIMES.has(file.type)) {
      reject(
        new Error(
          `Tipe file ${file.type} tidak diizinkan. Gunakan JPG / PNG / WebP / GIF untuk gambar atau MP4 / WebM / MOV untuk video.`,
        ),
      )
      return
    }
    if (!supabaseUrl || !anonKey) {
      reject(new Error('Konfigurasi Supabase tidak ditemukan. Periksa .env.local.'))
      return
    }

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        const token = data.session?.access_token ?? anonKey

        xhr.open('POST', uploadUrl)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.setRequestHeader('apikey', anonKey)
        xhr.setRequestHeader('cache-control', 'max-age=3600')
        xhr.setRequestHeader('x-upsert', 'false')
        if (file.type) xhr.setRequestHeader('content-type', file.type)

        let sampleTime = Date.now()
        let sampleLoaded = 0
        let smoothedSpeed = 0

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return
          const now = Date.now()
          const dt = (now - sampleTime) / 1000

          if (dt >= 0.5) {
            const instant = (e.loaded - sampleLoaded) / dt
            smoothedSpeed = smoothedSpeed === 0 ? instant : 0.4 * instant + 0.6 * smoothedSpeed
            sampleTime = now
            sampleLoaded = e.loaded
          }

          onProgress({
            loaded: e.loaded,
            total: e.total,
            percent: e.total > 0 ? (e.loaded / e.total) * 100 : 0,
            speed: smoothedSpeed,
          })
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
            resolve({ url: pub.publicUrl, path, size: file.size, type: file.type })
          } else {
            let message = `Upload gagal (${xhr.status})`
            try {
              const body = JSON.parse(xhr.responseText)
              if (body?.message) message = `${body.message} (HTTP ${xhr.status})`
              else if (body?.error) message = `${body.error} (HTTP ${xhr.status})`
            } catch {
              // Body wasn't JSON — keep default message
            }
            console.error('[upload] server error', {
              url: uploadUrl,
              status: xhr.status,
              statusText: xhr.statusText,
              responseText: xhr.responseText?.slice(0, 500),
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              hasSession: !!data.session,
            })
            reject(new Error(message))
          }
        }

        xhr.onerror = () => {
          console.error('[upload] network error', {
            url: uploadUrl,
            readyState: xhr.readyState,
            status: xhr.status,
            statusText: xhr.statusText,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            hasSession: !!data.session,
          })
          reject(
            new Error(
              'Network error saat upload. Cek koneksi internet, atau buka DevTools → Network untuk lihat request yang gagal.',
            ),
          )
        }

        xhr.ontimeout = () => reject(new Error('Upload timeout. Coba lagi atau pakai file lebih kecil.'))
        xhr.onabort = () => reject(new Error('Upload dibatalkan'))

        // 10-minute ceiling — enough for a 200 MB upload on a slow line, but
        // not so long we hold a stuck request forever.
        xhr.timeout = 10 * 60 * 1000

        xhr.send(file)
      })
      .catch((err) => {
        console.error('[upload] auth error', err)
        reject(err instanceof Error ? err : new Error(String(err)))
      })
  })

  return { promise, abort: () => xhr.abort() }
}

/**
 * Delete a file by its public URL or storage path. Best-effort — used during
 * "auto cleanup" flows where we don't want one bad delete to block the user.
 * Failure is logged, not thrown. Use {@link deleteFileStrict} when the user
 * triggers the delete and expects feedback.
 */
export async function deleteFile(urlOrPath: string): Promise<void> {
  const supabase = getSupabase()
  const path = extractStoragePath(urlOrPath)
  if (!path) return
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) console.warn('[storage] delete failed', error.message)
}

/** Same as {@link deleteFile} but throws on failure so the UI can show it. */
export async function deleteFileStrict(urlOrPath: string): Promise<void> {
  const supabase = getSupabase()
  const path = extractStoragePath(urlOrPath)
  if (!path) throw new Error('Path file tidak valid')
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw new Error(error.message)
}

/**
 * Delete many files in a single Supabase Storage API call. Much faster than
 * looping `deleteFileStrict` because each loop iteration would round-trip to
 * the server. Returns the list of paths the server actually removed.
 */
export async function deleteFilesBatch(urlsOrPaths: string[]): Promise<{
  removedPaths: string[]
  error?: string
}> {
  const supabase = getSupabase()
  const paths = urlsOrPaths.map(extractStoragePath).filter((p): p is string => !!p)
  if (paths.length === 0) return { removedPaths: [] }

  const { data, error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) return { removedPaths: [], error: error.message }

  // Supabase returns metadata for each removed file. Map back to paths so the
  // caller can update its UI with exactly what got deleted.
  const removedPaths = (data ?? []).map((entry) => {
    const fileObj = entry as { name?: string }
    return fileObj.name ?? ''
  }).filter(Boolean)

  // Fall back to assuming all requested paths were removed if the API didn't
  // return per-item info (Supabase versions vary on this).
  return { removedPaths: removedPaths.length > 0 ? removedPaths : paths }
}

/**
 * Given a public URL like `https://xxx.supabase.co/storage/v1/object/public/bsi-website/hero/123.jpg`,
 * return the storage path `hero/123.jpg`. Returns null if the URL isn't from our bucket.
 */
function extractStoragePath(urlOrPath: string): string | null {
  if (!urlOrPath) return null
  if (!urlOrPath.startsWith('http')) return urlOrPath
  const marker = `/object/public/${BUCKET}/`
  const idx = urlOrPath.indexOf(marker)
  if (idx === -1) return null
  return urlOrPath.slice(idx + marker.length)
}

export interface StoredFile {
  name: string
  path: string
  url: string
  size: number
  createdAt: string
  updatedAt: string
  mimeType: string
  isVideo: boolean
}

/**
 * List all files in a folder of the bucket. Returns newest-first.
 * Folder is treated as `prefix` argument used during upload.
 */
export async function listFiles(prefix: string): Promise<StoredFile[]> {
  const supabase = getSupabase()
  const safePrefix = prefix.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'misc'

  const { data, error } = await supabase.storage.from(BUCKET).list(safePrefix, {
    limit: 200,
    sortBy: { column: 'created_at', order: 'desc' },
  })

  if (error) throw new Error(error.message)
  if (!data) return []

  return data
    .filter((entry) => entry.name && !entry.name.startsWith('.')) // skip folders / placeholders
    .map((entry) => {
      const path = `${safePrefix}/${entry.name}`
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const mime = entry.metadata?.mimetype ?? guessMime(entry.name)
      return {
        name: entry.name,
        path,
        url: pub.publicUrl,
        size: entry.metadata?.size ?? 0,
        createdAt: entry.created_at ?? '',
        updatedAt: entry.updated_at ?? entry.created_at ?? '',
        mimeType: mime,
        isVideo: mime.startsWith('video/'),
      }
    })
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg'].includes(ext)) return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'webm') return 'video/webm'
  if (ext === 'mov') return 'video/quicktime'
  return 'application/octet-stream'
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Capture the current frame of a <video> element and upload it as a poster image.
 * Returns the public URL of the uploaded poster.
 *
 * Notes:
 *   - The video must be in a state where the requested currentTime has been seeked
 *     (readyState >= 2 and any pending 'seeked' event resolved).
 *   - Drawing remote videos to a canvas requires CORS-enabled responses; Supabase
 *     Storage public URLs are CORS-allowed by default.
 */
export async function captureVideoFrame(
  video: HTMLVideoElement,
  prefix: string,
  quality = 0.85,
): Promise<UploadResult> {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) {
    throw new Error('Video belum ter-load. Tunggu sampai video siap.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas tidak didukung oleh browser ini.')
  ctx.drawImage(video, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) throw new Error('Gagal mengconvert frame ke gambar.')

  const file = new File([blob], `poster-${Date.now()}.jpg`, { type: 'image/jpeg' })
  return uploadFile(file, prefix)
}
