import { useCallback, useEffect, useRef, useState } from 'react'

/** Where the <video> element gets its frames from. */
export type InputKind = 'camera' | 'file' | 'screen'
export type InputStatus = 'idle' | 'starting' | 'live' | 'error'

export interface LoadedFile {
  name: string
  url: string
}

const VIDEO_EXT = /\.(mp4|m4v|webm|mov)$/i
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']
export const VIDEO_ACCEPT = '.mp4,.m4v,.webm,.mov,video/mp4,video/webm,video/quicktime'

export function isVideoFile(f: File) {
  return VIDEO_TYPES.includes(f.type) || (f.type === '' && VIDEO_EXT.test(f.name)) || VIDEO_EXT.test(f.name)
}

export const canCaptureScreen = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia

/**
 * One <video> element, three kinds of input: the webcam (getUserMedia), a captured
 * browser tab or window (getDisplayMedia), or an uploaded file (object URL).
 * Starting one input always releases the previous one: streams are stopped and
 * object URLs revoked, including on unmount.
 */
export function useVideoInput() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const urlRef = useRef<string | null>(null)
  const runRef = useRef(0) // invalidates async starts that were superseded
  const [kind, setKind] = useState<InputKind | null>(null)
  const [status, setStatus] = useState<InputStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<LoadedFile | null>(null)

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
      if (video.getAttribute('src')) {
        video.removeAttribute('src')
        video.load()
      }
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
  }, [])

  const stop = useCallback(() => {
    runRef.current++
    release()
    setFile(null)
    setKind(null)
    setStatus('idle')
  }, [release])

  const attachStream = useCallback(async (stream: MediaStream, run: number) => {
    if (run !== runRef.current) {
      stream.getTracks().forEach((t) => t.stop())
      return false
    }
    streamRef.current = stream
    const video = videoRef.current
    if (video) {
      video.srcObject = stream
      await video.play().catch(() => undefined)
    }
    return true
  }, [])

  const startCamera = useCallback(async () => {
    const run = ++runRef.current
    release()
    setFile(null)
    setKind('camera')
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support camera access. Try Demo Mode or upload a video.')
      setStatus('error')
      return
    }
    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user', frameRate: { ideal: 30 } },
        audio: false,
      })
      if (await attachStream(stream, run)) setStatus('live')
    } catch (err) {
      if (run !== runRef.current) return
      const name = err instanceof DOMException ? err.name : ''
      setError(
        name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow access in your browser, or use Demo Mode.'
          : name === 'NotFoundError'
            ? 'No camera was found. Upload a video or use Demo Mode instead.'
            : `Could not start the camera${err instanceof Error ? `: ${err.message}` : ''}`,
      )
      setStatus('error')
    }
  }, [attachStream, release])

  const startScreen = useCallback(async () => {
    const run = ++runRef.current
    release()
    setFile(null)
    setKind('screen')
    setError(null)
    if (!canCaptureScreen()) {
      setError('This browser cannot capture tabs or windows. Use a desktop version of Chrome, Edge or Firefox.')
      setStatus('error')
      return
    }
    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      // The browser's own "Stop sharing" button ends the track; treat it like pressing Stop.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (run === runRef.current) stop()
      })
      if (await attachStream(stream, run)) setStatus('live')
    } catch (err) {
      if (run !== runRef.current) return
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'AbortError') {
        // The user closed the picker: not an error worth shouting about.
        setError(null)
        setStatus('idle')
        return
      }
      setError(`Could not capture the screen${err instanceof Error ? `: ${err.message}` : ''}`)
      setStatus('error')
    }
  }, [attachStream, release, stop])

  /** Switch to file mode without a file yet (shows the drop zone). */
  const chooseFile = useCallback(() => {
    runRef.current++
    release()
    setFile(null)
    setKind('file')
    setError(null)
    setStatus('idle')
  }, [release])

  const loadFile = useCallback(
    async (f: File) => {
      if (!isVideoFile(f)) {
        setKind('file')
        setError(`“${f.name}” isn’t a supported video. Use an .mp4, .webm or .mov file.`)
        setStatus('error')
        return
      }
      const run = ++runRef.current
      release()
      const url = URL.createObjectURL(f)
      urlRef.current = url
      setKind('file')
      setError(null)
      setStatus('starting')
      setFile({ name: f.name, url })
      const video = videoRef.current
      if (!video) return
      video.src = url
      try {
        await new Promise<void>((resolve, reject) => {
          const ok = () => {
            cleanup()
            resolve()
          }
          const bad = () => {
            cleanup()
            reject(new Error('the file could not be decoded'))
          }
          const cleanup = () => {
            video.removeEventListener('loadeddata', ok)
            video.removeEventListener('error', bad)
          }
          video.addEventListener('loadeddata', ok)
          video.addEventListener('error', bad)
        })
        if (run !== runRef.current) return
        setStatus('live')
        await video.play().catch(() => undefined)
      } catch (err) {
        if (run !== runRef.current) return
        release()
        setFile(null)
        setError(`Could not play “${f.name}”: ${err instanceof Error ? err.message : 'unknown error'}. Try an H.264 .mp4 or a .webm file.`)
        setStatus('error')
      }
    },
    [release],
  )

  // Release the camera / capture and revoke any object URL on unmount (also covers StrictMode remounts).
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    },
    [],
  )

  return { videoRef, kind, status, error, file, startCamera, startScreen, chooseFile, loadFile, stop }
}
