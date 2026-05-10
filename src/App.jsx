import { useRef, useState } from 'react'
import ShelfExperiencePage from './components/pages/ShelfExperiencePage'
import StoreExperiencePage from './components/pages/StoreExperiencePage'
import FeaturesSection from './components/sections/FeaturesSection'
import Header from './components/sections/Header'
import HeroSection from './components/sections/HeroSection'
import HowItWorksSection from './components/sections/HowItWorksSection'
import StoresSection from './components/sections/StoresSection'
import { useSmoothScroll } from './hooks/useSmoothScroll'
import './App.css'

function App() {
  const featuresRef = useRef(null)
  const storesRef = useRef(null)
  const howItWorksRef = useRef(null)
  const [activeStore, setActiveStore] = useState(null)
  const [activeLayout, setActiveLayout] = useState(null)
  const { scrollToSection } = useSmoothScroll()

  const handleFeaturesClick = () => {
    scrollToSection(featuresRef)
  }

  const handleStoresClick = () => {
    scrollToSection(storesRef)
  }

  const handleHowItWorksClick = () => {
    scrollToSection(howItWorksRef)
  }

  const handleStoreOpen = (store) => {
    setActiveStore(store)
  }

  const handleChangeStore = () => {
    setActiveLayout(null)
    setActiveStore(null)
  }

  const handleLayoutSelect = (layout) => {
    setActiveLayout(layout)
  }

  const handleBackToStore = () => {
    setActiveLayout(null)
  }

  if (activeStore && activeLayout) {
    return (
      <ShelfExperiencePage
        store={activeStore}
        layout={activeLayout}
        onBack={handleBackToStore}
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
      />
      <main>
        <HeroSection onStoresClick={handleStoresClick} onFeaturesClick={handleFeaturesClick} />
        <FeaturesSection sectionRef={featuresRef} />
        <HowItWorksSection sectionRef={howItWorksRef} />
        <StoresSection sectionRef={storesRef} onStoreOpen={handleStoreOpen} />
      </main>
    </div>
  )
}

export default App
