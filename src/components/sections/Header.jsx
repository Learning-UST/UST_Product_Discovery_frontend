import Button from '../ui/Button'

function Header({ onFeaturesClick, onStoresClick, onHowItWorksClick }) {
  return (
    <header className="top-nav">
      <a className="brand" href="#home" aria-label="SmartShop home">
        <span className="brand__mark">S</span>
        <span className="brand__text">SmartShop</span>
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

      <Button variant="secondary" className="top-nav__cta">
        Shop now {'->'}
      </Button>
    </header>
  )
}

export default Header
