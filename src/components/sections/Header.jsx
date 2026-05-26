import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import Button from '../ui/Button'
import './styles/Header.css'

const trimValue = (value) => (typeof value === 'string' ? value.trim() : '')

const extractShelfIdFromQrText = (rawValue) => {
  const value = trimValue(rawValue)
  if (!value) {
    return ''
  }

  if (/^\d+$/.test(value)) {
    return value
  }

  try {
    const parsed = new URL(value)
    return (
      trimValue(parsed.searchParams.get('shelfId')) ||
      trimValue(parsed.searchParams.get('layoutId')) ||
      trimValue(parsed.searchParams.get('savedLayoutId')) ||
      trimValue(parsed.searchParams.get('shelf')) ||
      ''
    )
  } catch {
    const match = value.match(/(?:shelfId|layoutId|savedLayoutId|shelf)=([^&]+)/i)
    return match?.[1] ? decodeURIComponent(match[1]).trim() : ''
  }
}

function Header({
  onFeaturesClick,
  onStoresClick,
  onHowItWorksClick,
  onQrShelfDetected,
  isQrLoading = false,
  isAuthenticated = false,
  username = '',
  onProfileClick,
}) {
  const [scanOpen, setScanOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [qrMessage, setQrMessage] = useState('')
  const [qrScanned, setQrScanned] = useState(false)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const qrScanLoopRef = useRef(null)

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not available on this browser.')
      return
    }
    try {
      setCameraError('')
      setQrMessage('Point the camera at a shelf QR code.')
      setQrScanned(false)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }
      streamRef.current = stream
      setIsCameraActive(true)
    } catch {
      setCameraError('Camera access failed.')
      setIsCameraActive(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setIsCameraActive(false)
  }

  useEffect(() => {
    const attachStream = async () => {
      if (!isCameraActive || !videoRef.current || !streamRef.current) return
      videoRef.current.srcObject = streamRef.current
      try { await videoRef.current.play() } catch { setCameraError('Camera started but video playback failed.') }
    }
    attachStream()
  }, [isCameraActive])

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (!isCameraActive || !videoRef.current || !canvasRef.current || qrScanned || isQrLoading) {
      return undefined
    }

    const scanQr = async () => {
      if (!videoRef.current || !canvasRef.current || qrScanned || isQrLoading) {
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas.getContext('2d', { willReadFrequently: true })

      if (!context) {
        setCameraError('QR scanning is not supported on this device.')
        return
      }

      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        qrScanLoopRef.current = requestAnimationFrame(scanQr)
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        const qrResult = jsQR(imageData.data, imageData.width, imageData.height)

        if (qrResult?.data) {
          const shelfId = extractShelfIdFromQrText(qrResult.data)

          if (shelfId) {
            setQrScanned(true)
            setQrMessage(`Shelf ${shelfId} detected. Opening...`)
            setCameraError('')
            stopCamera()

            try {
              await onQrShelfDetected?.(shelfId)
              setScanOpen(false)
            } catch {
              setQrScanned(false)
              setCameraError('QR scanned, but the shelf could not be opened.')
              setQrMessage('')
            }
            return
          }

          setCameraError('QR scanned, but no valid shelfId was found in the QR content.')
        }
      } catch {
        // Continue scanning until a valid QR code is found.
      }

      qrScanLoopRef.current = requestAnimationFrame(scanQr)
    }

    qrScanLoopRef.current = requestAnimationFrame(scanQr)

    return () => {
      if (qrScanLoopRef.current) {
        cancelAnimationFrame(qrScanLoopRef.current)
        qrScanLoopRef.current = null
      }
    }
  }, [isCameraActive, qrScanned, isQrLoading, onQrShelfDetected])

  return (
    <>
      <header className="top-nav">
        <a className="brand" href="#home" aria-label="Shopilot home">
          <span className="brand__mark">S</span>
          <span className="brand__text">Shopilot</span>
        </a>

        <nav className="top-nav__menu" aria-label="Primary navigation">
          <button type="button" className="top-nav__link" onClick={onFeaturesClick}>
            Features
          </button>
          <button type="button" className="top-nav__link" onClick={onStoresClick}>
            Stores
          </button>
          <button type="button" className="top-nav__link" onClick={onHowItWorksClick}>
            How it works
          </button>
        </nav>


        <div className="top-nav__actions">
          <button
            type="button"
            className="top-nav__scan-btn"
            aria-label="Scan shelf"
            onClick={() => {
              const opening = !scanOpen
              setScanOpen(opening)
              setCameraError('')
              setQrMessage('')
              setQrScanned(false)
              if (opening) startCamera()
              else stopCamera()
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h2v2h-2zM18 14h3M14 18v3M18 18h3v3h-3z" strokeLinecap="round" />
            </svg>
          </button>


          {/* Food Chat navigation button with auth check, styled like Shop now */}
          <Button
            variant="secondary"
            className="top-nav__cta"
            style={{ marginRight: 8 }}
            onClick={() => {
              try {
                const raw = window.localStorage.getItem('shopilotAuthSession:v1');
                const auth = raw ? JSON.parse(raw) : { authenticated: false };
                if (auth.authenticated) {
                  window.location.href = '/food';
                } else {
                  if (typeof window !== 'undefined' && typeof window.__showFoodChatLogin === 'function') {
                    window.__showFoodChatLogin();
                  }
                }
              } catch {
                // fallback: do nothing
              }
            }}
          >
            Food Chat
          </Button>

          <Button variant="secondary" className="top-nav__cta">
            Shop now {'->'}
          </Button>

          <button
            type="button"
            className="top-nav__profile-btn"
            onClick={onProfileClick}
            aria-label={isAuthenticated ? 'Open profile settings' : 'Sign in'}
          >
            <span className="top-nav__profile-avatar">
              {(isAuthenticated ? (username || 'U') : 'L').slice(0, 1).toUpperCase()}
            </span>
            <span className="top-nav__profile-label">
              {isAuthenticated ? (username || 'Profile') : 'Login'}
            </span>
          </button>
        </div>
      </header>

      {scanOpen && (
        <div className="top-nav__scan-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { stopCamera(); setScanOpen(false) } }}>
          <div className="top-nav__scan-modal">
            <div className="top-nav__scan-modal-header">
              <span className="top-nav__scan-modal-title">Scan Shelf</span>
              <button
                type="button"
                className="top-nav__scan-modal-close"
                onClick={() => { stopCamera(); setScanOpen(false) }}
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>
            {cameraError && <p className="top-nav__scan-error">{cameraError}</p>}
            {qrMessage && <p className="top-nav__scan-status">{qrMessage}</p>}
            {isCameraActive && (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="top-nav__scan-modal-video" />
                <canvas ref={canvasRef} className="top-nav__scan-canvas" aria-hidden="true" />
              </>
            )}
            {!isQrLoading && isCameraActive && !qrScanned && (
              <div className="top-nav__scan-modal-actions">
                <button type="button" className="top-nav__scan-secondary-btn" onClick={() => { stopCamera(); startCamera() }}>Retry camera</button>
              </div>
            )}
            {isQrLoading && (
              <div className="top-nav__scan-modal-actions">
                <button type="button" className="top-nav__scan-primary-btn" disabled>Opening shelf...</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default Header
