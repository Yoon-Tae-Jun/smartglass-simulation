import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'

// 웹캠(getUserMedia) 실시간 표시 (FR-SYS-1).
// - 마운트 시 카메라 스트림을 열고 <video>에 연결
// - 언마운트 시 track 정지(카메라 LED off)
// - 권한 거부/실패 시 공통 포맷 { status, msg }로 에러 오버레이 (FR-SYS-6)
// ref.capture() 로 현재 프레임을 dataURL로 캡처(이미지 번역용).
const WebcamView = forwardRef(function WebcamView(_props, ref) {
  const videoRef = useRef(null)
  const [error, setError] = useState(null) // { status, msg }

  useImperativeHandle(ref, () => ({
    capture() {
      const video = videoRef.current
      if (!video || !video.videoWidth) return null
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.85)
    },
  }))

  useEffect(() => {
    let stream = null
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError({ status: 501, msg: '이 브라우저는 카메라 접근(getUserMedia)을 지원하지 않습니다.' })
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (e) {
        setError({
          status: 403,
          msg: `카메라를 사용할 수 없습니다: ${e?.name ?? '알 수 없는 오류'}. 브라우저 카메라 권한을 확인해 주세요.`,
        })
      }
    }

    start()
    return () => {
      cancelled = true
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-cover"
      />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-navy-deep/90 px-6 text-center">
          <span className="eyebrow text-sky/70">status {error.status}</span>
          <p className="max-w-md text-white/80">{error.msg}</p>
        </div>
      )}
    </div>
  )
})

export default WebcamView
