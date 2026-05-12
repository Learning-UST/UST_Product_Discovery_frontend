import Button from '../ui/Button'

function HeroSection({ onStoresClick, onFeaturesClick }) {
  return (
    <section id="home" className="hero-section">
      <div className="hero-section__content">
        <span className="hero-section__pill">AI-powered in-store assistant</span>
        <h1 className="hero-section__title">
          Shop smarter, <em>aisle by aisle.</em>
        </h1>
        <p className="hero-section__description">
          Scan a shelf, search any product, or chat with our AI to find exactly what you need -
          ingredients, allergens, vegan options, and more.
        </p>
        <div className="hero-section__actions">
          <Button variant="primary" onClick={onStoresClick}>
            Choose a store {'->'}
          </Button>
          <Button variant="ghost" onClick={onFeaturesClick}>
            See how it works
          </Button>
        </div>
      </div>

      <div className="hero-product" aria-label="Featured product preview">
        <div className="hero-product__preview">
          <img
            src="/images/Starbucks_Doubleshot_Energy_Coffee_Mocha.png"
            alt="Featured drink"
            className="hero-product__image"
          />
        </div>
        <div className="hero-product__details">
          <h3 className="hero-product__name">Starbucks Doubleshot Energy Coffee Mocha (15 fl oz)</h3>
          <p className="hero-product__meta">Your shelf favorite</p>
          <span className="hero-product__price">₹120.00</span>
        </div>
      </div>
    </section>
  )
}

export default HeroSection
