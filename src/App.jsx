// import { useRef, useState } from 'react'
// import ShelfExperiencePage from './components/pages/ShelfExperiencePage'
// import StoreExperiencePage from './components/pages/StoreExperiencePage'
// import FeaturesSection from './components/sections/FeaturesSection'
// import Header from './components/sections/Header'
// import HeroSection from './components/sections/HeroSection'
// import HowItWorksSection from './components/sections/HowItWorksSection'
// import StoresSection from './components/sections/StoresSection'
// import { useSmoothScroll } from './hooks/useSmoothScroll'
// import { useSearchParams } from 'react-router-dom';
// import './App.css'

// function App() {
//   const featuresRef = useRef(null)
//   const storesRef = useRef(null)
//   const howItWorksRef = useRef(null)
//   const [activeStore, setActiveStore] = useState(null)
//   const [activeLayout, setActiveLayout] = useState(null)
//   const { scrollToSection } = useSmoothScroll()

//   const handleFeaturesClick = () => {
//     scrollToSection(featuresRef)
//   }

//   const handleStoresClick = () => {
//     scrollToSection(storesRef)
//   }

//   const handleHowItWorksClick = () => {
//     scrollToSection(howItWorksRef)
//   }

//   const handleStoreOpen = (store) => {
//     setActiveStore(store)
//   }

//   const handleChangeStore = () => {
//     setActiveLayout(null)
//     setActiveStore(null)
//   }

//   const handleLayoutSelect = (layout) => {
//     setActiveLayout(layout)
//   }

//   const handleBackToStore = () => {
//     setActiveLayout(null)
//   }

//   if (activeStore && activeLayout) {
//     return (
//       <ShelfExperiencePage
//         store={activeStore}
//         layout={activeLayout}
//         onBack={handleBackToStore}
//       />
//     )
//   }

//   if (activeStore) {
//     return (
//       <StoreExperiencePage
//         store={activeStore}
//         onChangeStore={handleChangeStore}
//         onLayoutSelect={handleLayoutSelect}
//       />
//     )
//   }

//   return (
//     <div className="page-shell">
//       <Header
//         onFeaturesClick={handleFeaturesClick}
//         onStoresClick={handleStoresClick}
//         onHowItWorksClick={handleHowItWorksClick}
//       />
//       <main>
//         <HeroSection onStoresClick={handleStoresClick} onFeaturesClick={handleFeaturesClick} />
//         <FeaturesSection sectionRef={featuresRef} />
//         <HowItWorksSection sectionRef={howItWorksRef} />
//         <StoresSection sectionRef={storesRef} onStoreOpen={handleStoreOpen} />
//       </main>
//     </div>
//   )
// }

// export default App


import { useRef, useState, useEffect } from 'react'
import ShelfExperiencePage from './components/pages/ShelfExperiencePage'
import StoreExperiencePage from './components/pages/StoreExperiencePage'
import FeaturesSection from './components/sections/FeaturesSection'
import Header from './components/sections/Header'
import HeroSection from './components/sections/HeroSection'
import HowItWorksSection from './components/sections/HowItWorksSection'
import StoresSection from './components/sections/StoresSection'
import { useSmoothScroll } from './hooks/useSmoothScroll'
import { fetchLayoutById, fetchPlanogramStoreById } from './services/planogramStoresApi'
import { getRuntimePreferences, setRuntimePreferences } from './services/api'
import './App.css'

const trimValue = (value) => (typeof value === 'string' ? value.trim() : '')

const extractShelfIdFromValue = (rawValue) => {
  const value = trimValue(rawValue)
  if (!value) {
    return ''
  }

  if (/^\d+$/.test(value)) {
    return value
  }

  try {
    const parsed = new URL(value)
    const nestedParams = parsed.searchParams
    return (
      trimValue(nestedParams.get('shelfId')) ||
      trimValue(nestedParams.get('layoutId')) ||
      trimValue(nestedParams.get('savedLayoutId')) ||
      trimValue(nestedParams.get('shelf')) ||
      ''
    )
  } catch {
    const match = value.match(/(?:shelfId|layoutId|savedLayoutId|shelf)=([^&]+)/i)
    return match?.[1] ? decodeURIComponent(match[1]).trim() : ''
  }
}

const resolveShelfIdFromLocation = (location) => {
  const params = new URLSearchParams(location.search)
  return (
    extractShelfIdFromValue(params.get('shelfId')) ||
    extractShelfIdFromValue(params.get('layoutId')) ||
    extractShelfIdFromValue(params.get('savedLayoutId')) ||
    extractShelfIdFromValue(params.get('shelf')) ||
    ''
  )
}

function App() {
  const featuresRef = useRef(null)
  const storesRef = useRef(null)
  const howItWorksRef = useRef(null)

  const [activeStore, setActiveStore] = useState(null)
  const [activeLayout, setActiveLayout] = useState(null)
  const [isAutoLoading, setIsAutoLoading] = useState(false)
  const [runtimePrefs, setRuntimePrefs] = useState(() => getRuntimePreferences())

  const { scrollToSection } = useSmoothScroll()

  const loadShelfById = async (shelfId) => {
    setIsAutoLoading(true)

    try {
      const layoutData = await fetchLayoutById(shelfId)
      const mappedLayout = {
        id: shelfId,
        name: layoutData.layout_data?.shelf_name || `Shelf ${shelfId}`,
        previewImage: layoutData.preview_image,
      }

      const storeId = layoutData.store_id || '1'
      const storeData = await fetchPlanogramStoreById(storeId)

      setActiveStore(storeData)
      setActiveLayout(mappedLayout)
    } catch (err) {
      console.error('QR Load Error:', err)
      throw err
    } finally {
      setIsAutoLoading(false)
    }
  }

  useEffect(() => {
    const shelfId = resolveShelfIdFromLocation(window.location)

    // Only auto-load if we have an ID and we aren't already looking at it
    if (shelfId && (!activeLayout || String(activeLayout.id) !== shelfId)) {
      loadShelfById(shelfId).catch(() => {})
    }
  }, []) // Run ONLY once on mount

  useEffect(() => {
    setRuntimePreferences(runtimePrefs)
  }, [runtimePrefs])

  // ── LOGIC 2: Sync URL when user navigates manually ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (activeLayout) {
      params.set('shelfId', activeLayout.id)
      params.delete('layoutId')
      params.delete('savedLayoutId')
      params.delete('shelf')
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`)
    } else {
      params.delete('shelfId')
      params.delete('layoutId')
      params.delete('savedLayoutId')
      params.delete('shelf')
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }
  }, [activeLayout])

  const handleFeaturesClick = () => scrollToSection(featuresRef)
  const handleStoresClick = () => scrollToSection(storesRef)
  const handleHowItWorksClick = () => scrollToSection(howItWorksRef)

  const handleStoreOpen = (store) => setActiveStore(store)
  const handleLayoutSelect = (layout) => setActiveLayout(layout)
  
  const handleChangeStore = () => {
    setActiveLayout(null)
    setActiveStore(null)
  }

  const handleBackToStore = () => {
    setActiveLayout(null)
  }

  const handleCurrencyToggle = (currency) => {
    setRuntimePrefs((prev) => ({ ...prev, currency }))
  }

  const handleCloudToggle = (cloudProvider) => {
    setRuntimePrefs((prev) => ({ ...prev, cloudProvider }))
  }

  // Loading state for QR scan redirection
  if (isAutoLoading) {
    return (
      <div className="app-loader">
        <div className="spinner"></div>
        <p>Initializing .....</p>
      </div>
    )
  }

  if (activeStore && activeLayout) {
    return (
      <ShelfExperiencePage
        store={activeStore}
        layout={activeLayout}
        onBack={handleBackToStore}
        onQrShelfDetected={loadShelfById}
        isQrLoading={isAutoLoading}
      />
    )
  }

  if (activeStore) {
    return (
      <StoreExperiencePage
        store={activeStore}
        onChangeStore={handleChangeStore}
        onLayoutSelect={handleLayoutSelect}
      />
    )
  }

  return (
    <div className="page-shell">
      <Header
        onFeaturesClick={handleFeaturesClick}
        onStoresClick={handleStoresClick}
        onHowItWorksClick={handleHowItWorksClick}
        onQrShelfDetected={loadShelfById}
        isQrLoading={isAutoLoading}
      />
      <main>
        <HeroSection
          onStoresClick={handleStoresClick}
          onFeaturesClick={handleFeaturesClick}
          currency={runtimePrefs.currency}
        />
        <FeaturesSection sectionRef={featuresRef} />
        <HowItWorksSection sectionRef={howItWorksRef} />
        <StoresSection sectionRef={storesRef} onStoreOpen={handleStoreOpen} />
      </main>
      <footer className="app-runtime-footer" aria-label="Runtime settings">
        <div className="app-runtime-footer__inner">
          {/* <p className="app-runtime-footer__label">Runtime Controls</p> */}
          <div className="app-runtime-footer__groups">
            <div className="app-runtime-toggle" role="group" aria-label="Currency mode">
              <span className="app-runtime-toggle__title">Currency</span>
              <div className="app-runtime-toggle__buttons">
                <button
                  type="button"
                  className={`app-runtime-toggle__btn ${runtimePrefs.currency === 'USD' ? 'is-active' : ''}`}
                  onClick={() => handleCurrencyToggle('USD')}
                >
                  USD
                </button>
                <button
                  type="button"
                  className={`app-runtime-toggle__btn ${runtimePrefs.currency === 'INR' ? 'is-active' : ''}`}
                  onClick={() => handleCurrencyToggle('INR')}
                >
                  INR
                </button>
              </div>
            </div>

            <div className="app-runtime-toggle" role="group" aria-label="Backend cloud provider">
              <span className="app-runtime-toggle__title">Cloud</span>
              <div className="app-runtime-toggle__buttons">
                <button
                  type="button"
                  className={`app-runtime-toggle__btn ${runtimePrefs.cloudProvider === 'AWS' ? 'is-active' : ''}`}
                  onClick={() => handleCloudToggle('AWS')}
                >
                  AWS
                </button>
                <button
                  type="button"
                  className={`app-runtime-toggle__btn ${runtimePrefs.cloudProvider === 'AZURE' ? 'is-active' : ''}`}
                  onClick={() => handleCloudToggle('AZURE')}
                >
                  Azure
                </button>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App