const iconMap = {
  qr: '[]',
  search: 'o-',
  chatbot: ':)',
}

function FeatureCard({ item }) {
  return (
    <article className="feature-card">
      <div className="feature-card__header">
        <span className="feature-card__icon" aria-hidden="true">
          {iconMap[item.id] || '*'}
        </span>
        <span className="feature-card__label">{item.label}</span>
      </div>
      <h3 className="feature-card__title">{item.title}</h3>
      <p className="feature-card__description">{item.description}</p>
    </article>
  )
}

export default FeatureCard
