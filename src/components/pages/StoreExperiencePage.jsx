import { useEffect, useMemo, useRef, useState } from 'react'
import './styles/StoreExperiencePage.css'
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { fetchAllProducts, fetchDirectProductDetails, getSpeechToken, sendChatQuery } from '../../services/api'
import { fuzzyFilter } from '../../utils/fuzzySearch'
function StoreExperiencePage({ store, onChangeStore, onLayoutSelect }) {
  const [activeTab, setActiveTab] = useState('scan')
  const [cameraError, setCameraError] = useState('')
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [capturedImage, setCapturedImage] = useState('')
  const [selectedShelf, setSelectedShelf] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [allProducts, setAllProducts] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [selectedProducts, setSelectedProducts] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [productLoadError, setProductLoadError] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const speechRecognizerRef = useRef(null)

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
    return () => {
      if (speechRecognizerRef.current) {
        speechRecognizerRef.current.close()
        speechRecognizerRef.current = null
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

  const handleSearchSubmit = async () => {
    // This calls the Agentic Brain we built in Flask
    const response = await fetch(`${API_BASE}/agent-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchTerm })
    });
    
    const data = await response.json();
    // The Agent's natural language answer
    console.log("Agent Says:", data.answer); 
    
    // Logic to highlight products based on Agent's answer
    if (data.answer.includes("Nissin")) {
       // Trigger highlight in your Digital Twin UI
    }
};

  const handleVoiceSearch = async () => {
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setSpeechError('Voice search requires a secure context or localhost.')
      return
    }
    try {
      setSpeechError('')
      setIsListening(true)

      if (speechRecognizerRef.current) {
        speechRecognizerRef.current.close()
        speechRecognizerRef.current = null
      }

      const { token, key, region } = await getSpeechToken()
      const authToken = token || key
      if (!authToken || !region) {
        throw new Error('Speech token response was incomplete.')
      }

      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(authToken, region)
      speechConfig.speechRecognitionLanguage = 'en-US'
      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput()
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig)
      speechRecognizerRef.current = recognizer

      recognizer.recognizeOnceAsync(
        (result) => {
          if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech && result.text) {
            setSearchTerm(result.text)
          } else if (result.reason === SpeechSDK.ResultReason.NoMatch) {
            setSpeechError('No speech was recognized. Please try again.')
          } else if (result.reason === SpeechSDK.ResultReason.Canceled) {
            setSpeechError('Voice search was canceled. Please try again.')
          }
          recognizer.close()
          if (speechRecognizerRef.current === recognizer) speechRecognizerRef.current = null
          setIsListening(false)
        },
        (err) => {
          setSpeechError(err?.message || 'Voice search failed. Please try again.')
          recognizer.close()
          if (speechRecognizerRef.current === recognizer) speechRecognizerRef.current = null
          setIsListening(false)
        }
      )
    } catch (err) {
      setSpeechError(err?.message || 'Voice search failed. Please try again.')
      setIsListening(false)
    }
  }

  // Load all products whenever Search tab is opened
  useEffect(() => {
    if (activeTab !== 'search') return
    setProductLoadError('')
    fetchAllProducts()
      .then((res) => {
        const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : [])
        if (list.length === 0 && res?.status && res.status !== 'success') {
          setProductLoadError('Could not load products: ' + (res.message || res.error || 'unknown error'))
        }
        setAllProducts(list)
      })
      .catch((err) => setProductLoadError('Failed to reach product API: ' + err.message))
  }, [activeTab])

  // Filter products as user types (fuzzy — handles punctuation, typos, spacing)
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); setShowDropdown(false); return }
    const filtered = fuzzyFilter(allProducts, searchTerm)
    setSearchResults(filtered)
    setShowDropdown(filtered.length > 0)
  }, [searchTerm, allProducts])

  const formatProductDetails = (p) => {
    const fields = [
      ['Name',              p.Name             || p.name],
      ['Brand',             p.Brand            || p.brand],
      ['Category',          p.Category         || p.category],
      ['Description',       p.Description      || p.description],
      ['Nutritional Facts', p.Nutritional_Facts || p.nutritional_facts],
    ]
    return fields
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
  }

  const handleSelectProduct = (product) => {
    const id = product.id || product.Name || product.name || product.product_name
    const label = product.Name || product.name || product.product_name || ''
    setSelectedProducts((prev) => {
      const alreadySelected = prev.find((p) => (p.id || p.Name || p.name || p.product_name) === id)
      const updated = alreadySelected
        ? prev.filter((p) => (p.id || p.Name || p.name || p.product_name) !== id)
        : [...prev, product]
      // Update search bar to show all selected product names comma-separated
      setSearchTerm(updated.map((p) => p.Name || p.name || p.product_name || '').join(', '))

      // Display details directly from the already-fetched product objects
      if (updated.length === 0) {
        setAiResponse('')
      } else {
        const text = updated
          .map((p) => formatProductDetails(p))
          .join('\n\n' + '─'.repeat(40) + '\n\n')
        setAiResponse(text)
      }

      return updated
    })
    setShowDropdown(false)
  }

  const isSelected = (product) => {
    const id = product.id || product.name || product.product_name
    return selectedProducts.some((p) => (p.id || p.name || p.product_name) === id)
  }

  const removeSelected = (product) => {
    const id = product.id || product.Name || product.name || product.product_name
    setSelectedProducts((prev) => {
      const updated = prev.filter((p) => (p.id || p.Name || p.name || p.product_name) !== id)
      setSearchTerm(updated.map((p) => p.Name || p.name || p.product_name || '').join(', '))
      if (updated.length === 0) {
        setAiResponse('')
      } else {
        const text = updated
          .map((p) => formatProductDetails(p))
          .join('\n\n' + '─'.repeat(40) + '\n\n')
        setAiResponse(text)
      }
      return updated
    })
  }

  const handleChatQuery = async () => {
    const query = searchTerm.trim()
    if (!query) return
    setAiResponse('Thinking...')
    try {
      const res = await sendChatQuery(query)
      setAiResponse(res.answer || JSON.stringify(res))
    } catch (err) {
      setAiResponse('Error: ' + err.message)
    }
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

            {/* Selected product chips */}
            {selectedProducts.length > 0 && (
              <div className="store-page__chips">
                {selectedProducts.map((p) => {
                  const id = p.id || p.name || p.product_name
                  const label = p.name || p.product_name || id
                  return (
                    <span key={id} className="store-page__chip">
                      {label}
                      <button
                        type="button"
                        className="store-page__chip-remove"
                        onClick={() => removeSelected(p)}
                        aria-label={`Remove ${label}`}
                      >
                        &#x2715;
                      </button>
                    </span>
                  )
                })}
              </div>
            )}

            {/* Search input with live dropdown */}
            <div className="store-page__search-wrap">
              <input
                type="search"
                className="store-page__search-input"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !showDropdown) handleChatQuery() }}
                placeholder="Search products or ask a question..."
                autoComplete="off"
              />
              <button
                type="button"
                className={`store-page__mic-btn ${isListening ? 'is-listening' : ''}`}
                aria-label={isListening ? 'Listening...' : 'Voice search'}
                onClick={handleVoiceSearch}
                disabled={isListening}
                title={isListening ? 'Listening...' : 'Click to search by voice'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M6.5 11v1.2a5.5 5.5 0 0 0 11 0V11" strokeLinecap="round" />
                  <path d="M12 18v3M9 21h6" strokeLinecap="round" />
                </svg>
                {isListening && <span className="store-page__mic-pulse" aria-hidden="true" />}
              </button>
              {productLoadError && (
                <p className="store-page__error" style={{ marginTop: '0.4rem', fontSize: '0.82rem' }}>
                  {productLoadError}
                </p>
              )}
              {showDropdown && (
                <ul className="store-page__search-dropdown" role="listbox">
                  {searchResults.map((product, i) => {
                    const id = product.id || product._id || product.UPC || product.upc || i
                    const label = product.Name || product.name || product.product_name || product.ProductName || String(id)
                    const brand = product.Brand || product.brand || ''
                    const selected = isSelected(product)
                    return (
                      <li
                        key={id}
                        role="option"
                        aria-selected={selected}
                        className={`store-page__search-option${selected ? ' is-selected' : ''}`}
                        onMouseDown={() => handleSelectProduct(product)}
                      >
                        <span className="store-page__option-name">{label}</span>
                        {brand && <span className="store-page__option-brand">{brand}</span>}
                        {selected && <span className="store-page__option-check">&#10003;</span>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {speechError && <p className="store-page__speech-error">{speechError}</p>}

            <button
              type="button"
              className="store-page__ask-btn"
              onClick={handleChatQuery}
              disabled={!searchTerm.trim()}
            >
              Ask AI
            </button>

            <textarea
              className="store-page__ai-response"
              readOnly
              value={aiResponse}
              placeholder="AI response will appear here..."
            />
          </div>
        )}
      </section>
    </div>
  )
}

export default StoreExperiencePage
