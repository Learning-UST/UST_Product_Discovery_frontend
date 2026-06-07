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
import { getRuntimePreferences, setRuntimePreferences, setAgentProvider, getCloudProviderStatus } from './services/api'
import './App.css'

const AUTH_STORAGE_KEY = 'shopilotAuthSession:v1'
const DEFAULT_LOGIN_CREDENTIALS = {
  username: 'ust',
  password: '123456',
}

const trimValue = (value) => (typeof value === 'string' ? value.trim() : '')
const normalizeCloudProviderValue = (value) => (String(value || '').toUpperCase() === 'AZURE' ? 'AZURE' : 'AWS')

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

const getStoredAuthSession = () => {
  if (typeof window === 'undefined') {
    return { authenticated: false, username: '' }
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      return { authenticated: false, username: '' }
    }

    const parsed = JSON.parse(raw)
    return {
      authenticated: Boolean(parsed?.authenticated),
      username: String(parsed?.username || ''),
    }
  } catch {
    return { authenticated: false, username: '' }
  }
}

const persistAuthSession = (session) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Ignore storage write failures.
  }
}

const clearAuthSession = () => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // Ignore storage delete failures.
  }
}

const clearShelfQueryFromUrl = () => {
  if (typeof window === 'undefined') {
    return
  }

  const params = new URLSearchParams(window.location.search)
  params.delete('shelfId')
  params.delete('layoutId')
  params.delete('savedLayoutId')
  params.delete('shelf')
  const nextUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
  window.history.replaceState({}, '', nextUrl)
}

function LoginPage({ onLogin, onCancel, error }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    onLogin({ username, password })
  }

  return (
    <div className="app-login-shell">
      <div className="app-login-card" role="dialog" aria-labelledby="app-login-title" aria-modal="true">
        <p className="app-login-card__eyebrow">Protected Access</p>
        <h1 id="app-login-title" className="app-login-card__title">Sign In to Continue</h1>
        <p className="app-login-card__subtitle">Only authorized users can access shelf experience.</p>

        <form className="app-login-card__form" onSubmit={handleSubmit}>
          <label className="app-login-card__label" htmlFor="app-login-username">Username</label>
          <input
            id="app-login-username"
            type="text"
            className="app-login-card__input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />

          <label className="app-login-card__label" htmlFor="app-login-password">Password</label>
          <input
            id="app-login-password"
            type="password"
            className="app-login-card__input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {error && <p className="app-login-card__error">{error}</p>}

          <div className="app-login-card__actions">
            <button type="button" className="app-login-card__btn app-login-card__btn--ghost" onClick={onCancel}>
              Back
            </button>
            <button type="submit" className="app-login-card__btn app-login-card__btn--primary">
              Login
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProfilePage({ username, runtimePrefs, onCurrencyToggle, onCloudToggle, onBack, onLogout }) {
  return (
    <div className="app-profile-page">
      <div className="app-profile-page__card">
        <div className="app-profile-page__header">
          <button type="button" className="app-profile-page__back" onClick={onBack}>
            {'<-'} Back to home
          </button>
          <button type="button" className="app-profile-page__logout" onClick={onLogout}>
            Logout
          </button>
        </div>

        <p className="app-profile-page__eyebrow">Profile</p>
        <h1 className="app-profile-page__title">Runtime Preferences</h1>
        <p className="app-profile-page__subtitle">Signed in as {username}</p>

        <div className="app-profile-page__groups">
          <div className="app-runtime-toggle" role="group" aria-label="Currency mode">
            <span className="app-runtime-toggle__title">Currency</span>
            <div className="app-runtime-toggle__buttons">
              <button
                type="button"
                className={`app-runtime-toggle__btn ${runtimePrefs.currency === 'USD' ? 'is-active' : ''}`}
                onClick={() => onCurrencyToggle('USD')}
              >
                USD
              </button>
              <button
                type="button"
                className={`app-runtime-toggle__btn ${runtimePrefs.currency === 'INR' ? 'is-active' : ''}`}
                onClick={() => onCurrencyToggle('INR')}
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
                onClick={() => onCloudToggle('AWS')}
              >
                AWS
              </button>
              <button
                type="button"
                className={`app-runtime-toggle__btn ${runtimePrefs.cloudProvider === 'AZURE' ? 'is-active' : ''}`}
                onClick={() => onCloudToggle('AZURE')}
              >
                Azure
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  const [activeView, setActiveView] = useState('home')
  const [showLogin, setShowLogin] = useState(false)
  const [authError, setAuthError] = useState('')
  const [pendingShelfId, setPendingShelfId] = useState('')
  const [pendingLayout, setPendingLayout] = useState(null)
  const [pendingStore, setPendingStore] = useState(null)
  const [pendingProfileOpen, setPendingProfileOpen] = useState(false)
  const [authSession, setAuthSession] = useState(() => getStoredAuthSession())

  const { scrollToSection } = useSmoothScroll()

  const isAuthenticated = authSession.authenticated

  const loadShelfById = async (shelfId, options = {}) => {
    const { skipAuthCheck = false } = options

    if (!skipAuthCheck && !isAuthenticated) {
      setPendingShelfId(String(shelfId || ''))
      setPendingLayout(null)
      setPendingStore(null)
      setShowLogin(true)
      setAuthError('')
      return
    }

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
    let cancelled = false

    const syncCloudProviderFromBackend = async () => {
      try {
        const status = await getCloudProviderStatus()
        if (cancelled) return

        const backendProvider = normalizeCloudProviderValue(status?.cloud_provider)
        setRuntimePrefs((prev) => ({ ...prev, cloudProvider: backendProvider }))
      } catch (error) {
        console.warn('Failed to fetch backend cloud provider status:', error)
      }
    }

    void syncCloudProviderFromBackend()

    return () => {
      cancelled = true
    }
  }, [])

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
  const handleLayoutSelect = (layout) => {
    if (!isAuthenticated) {
      setPendingStore(activeStore)
      setPendingLayout(layout)
      setPendingShelfId('')
      setShowLogin(true)
      setAuthError('')
      return
    }

    setActiveLayout(layout)
  }
  
  const handleChangeStore = () => {
    setActiveLayout(null)
    setActiveStore(null)
    setActiveView('home')
  }

  const handleBackToStore = () => {
    setActiveLayout(null)
  }

  const handleLoginCancel = () => {
    const hadShelfIntent = Boolean(pendingShelfId)

    setShowLogin(false)
    setAuthError('')
    setPendingShelfId('')
    setPendingLayout(null)
    setPendingStore(null)
    setPendingProfileOpen(false)

    if (hadShelfIntent) {
      clearShelfQueryFromUrl()
    }
  }

  const handleLogin = async ({ username, password }) => {
    const normalizedUsername = String(username || '').trim()
    const normalizedPassword = String(password || '')


    if (
      normalizedUsername.toLowerCase() !== DEFAULT_LOGIN_CREDENTIALS.username.toLowerCase() ||
      normalizedPassword !== DEFAULT_LOGIN_CREDENTIALS.password
    ) {
      setAuthError('Invalid credentials. Please try again.')
      return
    }

    const nextSession = {
      authenticated: true,
      username: normalizedUsername || DEFAULT_LOGIN_CREDENTIALS.username,
    }

    setAuthSession(nextSession)
    persistAuthSession(nextSession)
    setShowLogin(false)
    setAuthError('')

    // If user was trying to access Food Chat, go there after login
    if (window.localStorage.getItem('shopilotPendingFoodChat')) {
      window.localStorage.removeItem('shopilotPendingFoodChat');
      window.location.href = '/food';
      return;
    }

    if (pendingShelfId) {
      const targetShelfId = pendingShelfId
      setPendingShelfId('')
      setPendingLayout(null)
      setPendingStore(null)
      await loadShelfById(targetShelfId, { skipAuthCheck: true })
      return
    }

    if (pendingStore && pendingLayout) {
      setActiveStore(pendingStore)
      setActiveLayout(pendingLayout)
      setPendingStore(null)
      setPendingLayout(null)
      setPendingProfileOpen(false)
      return
    }

    // Only go to profile if user explicitly requested it
    if (pendingProfileOpen) {
      setActiveView('profile')
      setPendingProfileOpen(false)
    }
  }

  const handleLogout = () => {
    clearAuthSession()
    setAuthSession({ authenticated: false, username: '' })
    setActiveView('home')
    setActiveLayout(null)
    setPendingShelfId('')
    setPendingLayout(null)
    setPendingStore(null)
    setPendingProfileOpen(false)
    clearShelfQueryFromUrl()
  }

  const handleOpenProfilePage = () => {
    if (!isAuthenticated) {
      setPendingProfileOpen(true)
      setShowLogin(true)
      setAuthError('')
      return
    }

    setActiveView('profile')
  }

  const handleCurrencyToggle = (currency) => {
    setRuntimePrefs((prev) => ({ ...prev, currency }))
  }

  const handleCloudToggle = async (cloudProvider) => {
    const normalizedCloudProvider = normalizeCloudProviderValue(cloudProvider)
    const previousCloudProvider = runtimePrefs.cloudProvider

    if (normalizedCloudProvider === previousCloudProvider) {
      return
    }

    setRuntimePrefs((prev) => ({ ...prev, cloudProvider: normalizedCloudProvider }))

    try {
      await setAgentProvider(normalizedCloudProvider)
      const status = await getCloudProviderStatus()
      const confirmedProvider = normalizeCloudProviderValue(status?.cloud_provider)
      setRuntimePrefs((prev) => ({ ...prev, cloudProvider: confirmedProvider }))
    } catch (error) {
      console.error('Failed to update backend cloud provider:', error)
      setRuntimePrefs((prev) => ({ ...prev, cloudProvider: previousCloudProvider }))
    }
  }

  if (showLogin) {
    return <LoginPage onLogin={handleLogin} onCancel={handleLoginCancel} error={authError} />
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

  if (activeView === 'profile') {
    return (
      <ProfilePage
        username={authSession.username || 'User'}
        runtimePrefs={runtimePrefs}
        onCurrencyToggle={handleCurrencyToggle}
        onCloudToggle={handleCloudToggle}
        onBack={() => setActiveView('home')}
        onLogout={handleLogout}
      />
    )
  }

  // Expose a global callback for Header to trigger login modal for Food Chat
  if (typeof window !== 'undefined') {
    window.__showFoodChatLogin = () => {
      setShowLogin(true);
      setAuthError('');
      setPendingShelfId('');
      setPendingLayout(null);
      setPendingStore(null);
      setPendingProfileOpen(false);
    };
  }

  return (
    <div className="page-shell">
      <Header
        onFeaturesClick={handleFeaturesClick}
        onStoresClick={handleStoresClick}
        onHowItWorksClick={handleHowItWorksClick}
        onQrShelfDetected={loadShelfById}
        isQrLoading={isAutoLoading}
        isAuthenticated={isAuthenticated}
        username={authSession.username}
        onProfileClick={handleOpenProfilePage}
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
    </div>
  )
}

export default App