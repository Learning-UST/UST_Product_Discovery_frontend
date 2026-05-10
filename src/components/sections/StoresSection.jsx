import { useEffect, useState } from 'react'
import { fetchPlanogramStoreById, fetchPlanogramStores } from '../../services/planogramStoresApi'
import SectionHeading from '../ui/SectionHeading'
import StoreCard from '../ui/StoreCard'

function StoresSection({ sectionRef, onStoreOpen }) {
  const [stores, setStores] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOpeningStoreId, setIsOpeningStoreId] = useState(null)
  const [loadMessage, setLoadMessage] = useState('')

  useEffect(() => {
    let isDisposed = false

    const loadStores = async () => {
      setIsLoading(true)
      setLoadMessage('')

      try {
        const result = await fetchPlanogramStores()

        if (isDisposed) {
          return
        }

        if (result.stores.length === 0) {
          setStores([])
          setLoadMessage('No stores are available from planogram yet.')
          return
        }

        setStores(result.stores)
      } catch {
        if (isDisposed) {
          return
        }

        setStores([])
        setLoadMessage('Could not load planogram stores right now. Please try again.')
      } finally {
        if (!isDisposed) {
          setIsLoading(false)
        }
      }
    }

    loadStores()

    return () => {
      isDisposed = true
    }
  }, [])

  const handleStoreOpen = async (store) => {
    const storeId = store?.id

    if (!storeId) {
      onStoreOpen(store)
      return
    }

    setIsOpeningStoreId(storeId)

    try {
      const detailedStore = await fetchPlanogramStoreById(storeId)
      onStoreOpen(detailedStore)
    } catch {
      onStoreOpen(store)
    } finally {
      setIsOpeningStoreId(null)
    }
  }

  return (
    <section ref={sectionRef} className="content-section content-section--stores" id="stores">
      <SectionHeading
        id="stores-title"
        eyebrow="Pick your store"
        title="Available locations."
        description="Tap a store to start scanning shelves, searching products, or chatting with the assistant."
      />

      {isLoading ? <p className="stores-status">Loading stores from planogram (all users)...</p> : null}
      {!isLoading && loadMessage ? <p className="stores-status">{loadMessage}</p> : null}
      {!isLoading && !loadMessage && stores.length === 0 ? (
        <p className="stores-status">No stores found.</p>
      ) : null}

      <div className="stores-grid">
        {stores.map((store) => (
          <StoreCard
            key={store.id}
            store={store}
            onOpen={handleStoreOpen}
            isOpening={isOpeningStoreId === store.id}
          />
        ))}
      </div>
    </section>
  )
}

export default StoresSection
