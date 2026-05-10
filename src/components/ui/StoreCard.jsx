function StoreCard({ store, onOpen, isOpening = false }) {
  return (
    <article className="store-card">
      <div className="store-card__visual" role="presentation">
        <span className="store-card__badge">{store.badge}</span>
        <span className="store-card__number">{store.number}</span>
      </div>
      <div className="store-card__content">
        <h3 className="store-card__title">{store.name}</h3>
        <p className="store-card__address">{store.address}</p>
        <button
          type="button"
          className="store-card__open"
          onClick={() => onOpen(store)}
          disabled={isOpening}
        >
          {isOpening ? 'Opening...' : 'Open'}
        </button>
      </div>
    </article>
  )
}

export default StoreCard
