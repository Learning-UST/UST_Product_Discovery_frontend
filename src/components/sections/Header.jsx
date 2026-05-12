import { useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'
import './styles/Header.css'

function Header({ onFeaturesClick, onStoresClick, onHowItWorksClick }) {
  const [scanOpen, setScanOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [capturedImage, setCapturedImage] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not available on this browser.')
      return
    }

    try {
      setCameraError('')
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }

      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }

      streamRef.current = stream
      setCapturedImage('')
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

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsCameraActive(false)
  }

  const captureFrame = () => {
    if (!videoRef.current) return

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const context = canvas.getContext('2d')
    if (!context) {
      setCameraError('Capture failed.')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    setCapturedImage(canvas.toDataURL('image/png'))
    stopCamera()
  }

  const handleRetake = async () => {
    setCapturedImage('')
    await startCamera()
  }

  useEffect(() => {
    const attachStream = async () => {
      if (!isCameraActive || !videoRef.current || !streamRef.current) return
      videoRef.current.srcObject = streamRef.current
      try {
        await videoRef.current.play()
      } catch {
        setCameraError('Camera started but video playback failed.')
      }
    }

    attachStream()
  }, [isCameraActive])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  return (
    <>
      <header className="top-nav">
        <a className="brand" href="#home" aria-label="SmartShop home">
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
              setCapturedImage('')
              setCameraError('')
              if (opening) {
                startCamera()
              } else {
                stopCamera()
              }
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h2v2h-2zM18 14h3M14 18v3M18 18h3v3h-3z" strokeLinecap="round" />
            </svg>
          </button>

          <Button variant="secondary" className="top-nav__cta" onClick={onStoresClick}>
            Shop now {'->'}
          </Button>
        </div>
      </header>

      {scanOpen && (
        <div
          className="top-nav__scan-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              stopCamera()
              setScanOpen(false)
            }
          }}
        >
          <div className="top-nav__scan-modal">
            <div className="top-nav__scan-modal-header">
              <span className="top-nav__scan-modal-title">Scan Shelf</span>
              <button
                type="button"
                className="top-nav__scan-modal-close"
                onClick={() => {
                  stopCamera()
                  setScanOpen(false)
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {cameraError && <p className="top-nav__scan-error">{cameraError}</p>}

            {isCameraActive && (
              <video ref={videoRef} autoPlay playsInline muted className="top-nav__scan-modal-video" />
            )}

            {!isCameraActive && capturedImage && (
              <div className="top-nav__capture-result">
                <img src={capturedImage} alt="Captured shelf" className="top-nav__captured-image" />
                <button type="button" className="top-nav__secondary-btn" onClick={handleRetake}>Retake</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default Header
