import { useEffect, useMemo, useRef, useState } from 'react'
import './styles/StoreExperiencePage.css'

function StoreExperiencePage({ store, onChangeStore, onLayoutSelect }) {
  const [activeTab, setActiveTab] = useState('scan')
  const [cameraError, setCameraError] = useState('')
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [capturedImage, setCapturedImage] = useState('')
  const [selectedShelf, setSelectedShelf] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const shelfOptions = useMemo(() => {
    const layoutNames = Array.isArray(store.layouts)
      ? store.layouts.map((layout) => layout?.name).filter((name) => typeof name === 'string' && name.trim())
      : []

    if (layoutNames.length > 0) {
      return layoutNames
    }

    return Array.isArray(store.shelves) ? store.shelves : []
  }, [store.layouts, store.shelves])

  useEffect(() => {
    setSelectedShelf(shelfOptions[0] || '')
  }, [shelfOptions])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    const attachStream = async () => {
      if (!isCameraActive || !videoRef.current || !streamRef.current) {
        return
      }

      videoRef.current.srcObject = streamRef.current

      try {
        await videoRef.current.play()
      } catch {
        setCameraError('Camera started but video playback failed. Please retry.')
      }
    }

    attachStream()
  }, [isCameraActive])

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not available on this browser. Use upload or shelf selection.')
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
        // Fallback for devices/browsers that cannot satisfy rear-camera constraints.
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
      }

      streamRef.current = stream

      setCapturedImage('')
      setIsCameraActive(true)
    } catch {
      setCameraError('Camera access failed. You can upload a shelf image or choose a shelf manually.')
      setIsCameraActive(false)
    }
  }

  const captureFrame = () => {
    if (!videoRef.current) {
      return
    }

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const context = canvas.getContext('2d')
    if (!context) {
      setCameraError('Capture failed. Please try again.')
      return
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    setCapturedImage(canvas.toDataURL('image/png'))
    stopCamera()
  }

  const handleGoToLayout = () => {
    if (!selectedShelf) return
    const layout = Array.isArray(store.layouts)
      ? store.layouts.find((l) => l.name === selectedShelf)
      : null
    if (layout && onLayoutSelect) {
      onLayoutSelect(layout)
    }
  }

  const handleRetake = async () => {
    setCapturedImage('')
    await startCamera()
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

  return (
    <div className="store-page">
      <header className="store-page__hero">
        <button type="button" className="store-page__change-store" onClick={onChangeStore}>
          {'<-'} Change store
        </button>

        <p className="store-page__eyebrow">Now shopping at</p>
        <h1 className="store-page__title">{store.name}</h1>
        <p className="store-page__address">{store.address}</p>
      </header>

      <section className="store-page__content">
        <div className="store-page__tabs" role="tablist" aria-label="Store actions">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'scan'}
            className={`store-page__tab ${activeTab === 'scan' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('scan')}
          >
            Scan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'search'}
            className={`store-page__tab ${activeTab === 'search' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            Search
          </button>
        </div>

        {activeTab === 'scan' ? (
          <div className="store-page__panel">
            <h2 className="store-page__panel-title">Scan a shelf QR code</h2>

            <button type="button" className="store-page__scan-btn" onClick={startCamera}>
              Open Camera and Scan
            </button>

            {cameraError ? <p className="store-page__error">{cameraError}</p> : null}

            {isCameraActive ? (
              <div className="store-page__camera-wrap">
                <video ref={videoRef} autoPlay playsInline muted className="store-page__camera" />
                <div className="store-page__camera-actions">
                  <button type="button" className="store-page__capture-btn" onClick={captureFrame}>
                    Capture
                  </button>
                  <button type="button" className="store-page__secondary-btn" onClick={stopCamera}>
                    Stop camera
                  </button>
                </div>
              </div>
            ) : null}

            {capturedImage ? (
              <div className="store-page__capture-result">
                <p className="store-page__capture-label">Captured shelf image</p>
                <img src={capturedImage} alt="Captured shelf" className="store-page__captured-image" />
                <button type="button" className="store-page__secondary-btn" onClick={handleRetake}>
                  Retake
                </button>
              </div>
            ) : null}

            <label className="store-page__upload-label" htmlFor="shelf-upload">
              Upload shelf image
            </label>
            <input id="shelf-upload" type="file" accept="image/*" className="store-page__upload" />

            <label className="store-page__shelf-label" htmlFor="shelf-select">
              Or choose layout/shelf manually
            </label>
            <div className="store-page__select-row">
              <select
                id="shelf-select"
                className="store-page__select"
                value={selectedShelf}
                onChange={(event) => setSelectedShelf(event.target.value)}
              >
                {shelfOptions.map((shelf) => (
                  <option key={shelf} value={shelf}>
                    {shelf}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="store-page__go-btn"
                onClick={handleGoToLayout}
                disabled={!selectedShelf}
              >
                Go
              </button>
            </div>
          </div>
        ) : (
          <div className="store-page__panel">
            <h2 className="store-page__panel-title">Search products in this store</h2>
            <input
              type="search"
              className="store-page__search-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by product or brand"
            />
          </div>
        )}
      </section>
    </div>
  )
}

export default StoreExperiencePage
