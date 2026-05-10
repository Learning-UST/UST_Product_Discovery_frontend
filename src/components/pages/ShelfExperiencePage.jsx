import { useEffect, useState } from 'react'
import { fetchLayoutById } from '../../services/planogramStoresApi'
import './styles/ShelfExperiencePage.css'

const KNOWN_BRAND_COLORS = {
  "lay's": '#F5C400',
  'lays': '#F5C400',
  'doritos': '#E84A24',
  'oreo': '#2B2B2B',
  'snickers': '#865522',
  'cheetos': '#F28B00',
  'pringles': '#C01E2F',
  'ruffles': '#1E4F9F',
  'fritos': '#E6A714',
  'tostitos': '#D84A1F',
  'kettle': '#8B5E3C',
  'popchips': '#E86C1F',
  'nature valley': '#8DB33A',
  'kind': '#F4A623',
  'clif': '#B5A642',
  'rxbar': '#C63F2C',
  'planters': '#C20E1A',
  'm&m': '#E31837',
  'reese': '#E87722',
  'kitkat': '#CD2027',
  'twix': '#D4A017',
  'hershey': '#4B2F22',
  'nestle': '#009FE3',
  'pepsi': '#004C97',
  'coca-cola': '#E8000D',
  'coke': '#E8000D',
  'sprite': '#00843D',
  'fanta': '#F47921',
}

const getBrandColor = (brand, productName) => {
  const key = (brand || productName || '').toLowerCase().trim()
  for (const [pattern, color] of Object.entries(KNOWN_BRAND_COLORS)) {
    if (key.includes(pattern)) return color
  }
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 58%, 38%)`
}

const getBrandLabel = (product) => {
  if (product.brand) return product.brand
  const name = product.name || ''
  return name.split(' ')[0] || '?'
}

const parseLayoutData = (raw) => {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return raw
}

const parseProducts = (rawLayoutData) => {
  const data = parseLayoutData(rawLayoutData)

  // Build a catalog map: product name → full catalog entry
  const catalog = Array.isArray(data.product_catalog) ? data.product_catalog : []
  const catalogByName = {}
  for (const entry of catalog) {
    if (entry && entry.name) catalogByName[entry.name] = entry
  }

  // Walk layout_plan → rows → products (each is { product_name, arrangement })
  const layoutPlan = Array.isArray(data.layout_plan) ? data.layout_plan : []
  const seen = {}
  const products = []

  for (const shelf of layoutPlan) {
    const rows = Array.isArray(shelf.rows) ? shelf.rows : []
    for (const row of rows) {
      const placements = Array.isArray(row.products) ? row.products : []
      for (const placement of placements) {
        const productName = placement.product_name
        if (!productName) continue
        const arrangement = placement.arrangement || {}
        const totalQty = Number(arrangement.total_quantity) || 0

        if (seen[productName] != null) {
          // Aggregate quantity across multiple placements of same product
          products[seen[productName]].stock_count += totalQty
          continue
        }

        const cat = catalogByName[productName] || {}
        seen[productName] = products.length
        products.push({
          name: productName,
          id: cat.id ?? productName,
          category: cat.category || '',
          price: cat.price ?? null,
          brand: cat.brand || '',
          imageUrl: cat.imageUrl || cat.image_url || '',
          modelUrl: cat.modelUrl || cat.model_url || '',
          upc: cat.upc || '',
          heightInCm: cat.heightInCm ?? null,
          widthInCm: cat.widthInCm ?? null,
          depthInCm: cat.depthInCm ?? null,
          stock_count: totalQty,
        })
      }
    }
  }

  return products
}

const parseShelfMeta = (rawLayoutData) => {
  const data = parseLayoutData(rawLayoutData)
  // aisle_specifications is the sub-object from the AI output
  const spec = data.aisle_specifications || {}
  const layoutPlan = Array.isArray(data.layout_plan) ? data.layout_plan : []
  const firstShelf = layoutPlan[0] || {}
  return {
    aisleNumber: spec.aisle_number || data.aisle_number || firstShelf.aisle_number || firstShelf.aisle || '1',
    shelfCode: spec.shelf_code || data.shelf_code || firstShelf.shelf_code || firstShelf.code || '',
    shelfCount: layoutPlan.length,
  }
}

function ProductCard({ product, expanded, onToggle }) {
  const brandLabel = getBrandLabel(product)
  const color = product.brand_color || getBrandColor(product.brand, product.name)
  const inStock = product.stock_count == null ? true : Number(product.stock_count) > 0
  const stockCount = product.stock_count ?? product.quantity

  return (
    <li className="shelf-product">
      <button type="button" className="shelf-product__main" onClick={onToggle}>
        <div
          className="shelf-product__logo"
          style={{ background: color }}
          aria-hidden="true"
        >
          {brandLabel}
        </div>
        <div className="shelf-product__info">
          <p className="shelf-product__name">{product.name || 'Unknown product'}</p>
          <p className="shelf-product__meta">
            {[product.category, product.price != null ? `$${Number(product.price).toFixed(2)}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="shelf-product__right">
          {inStock ? (
            <span className="shelf-product__badge shelf-product__badge--in">
              {stockCount != null ? `${stockCount} in stock` : 'In stock'}
            </span>
          ) : (
            <span className="shelf-product__badge shelf-product__badge--out">Out of stock</span>
          )}
          <span className={`shelf-product__chevron ${expanded ? 'is-open' : ''}`}>
            &#8964;
          </span>
        </div>
      </button>

      {expanded && (
        <div className="shelf-product__detail">
          {product.description && (
            <p className="shelf-product__desc">{product.description}</p>
          )}
          <div className="shelf-product__detail-grid">
            {product.upc && <span><strong>UPC:</strong> {product.upc}</span>}
            {product.heightInCm != null && <span><strong>Height:</strong> {product.heightInCm} cm</span>}
            {product.widthInCm != null && <span><strong>Width:</strong> {product.widthInCm} cm</span>}
            {product.depthInCm != null && <span><strong>Depth:</strong> {product.depthInCm} cm</span>}
          </div>
        </div>
      )}
    </li>
  )
}

function ShelfExperiencePage({ store, layout, onBack }) {
  const [fullLayout, setFullLayout] = useState(null)
  const [products, setProducts] = useState([])
  const [shelfMeta, setShelfMeta] = useState({ aisleNumber: '1', shelfCode: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        // API returns { layout_data, chat_history, sessionId, status }
        const response = await fetchLayoutById(layout.id)
        if (cancelled) return
        const layoutData = response.layout_data
        setFullLayout(response)
        setProducts(parseProducts(layoutData))
        setShelfMeta(parseShelfMeta(layoutData))
      } catch {
        if (!cancelled) setError('Failed to load shelf data from planogram.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [layout.id])

  const filteredProducts = searchTerm
    ? products.filter(
        (p) =>
          p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.category?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : products

  const toggleProduct = (key) => {
    setExpandedId((prev) => (prev === key ? null : key))
  }

  // The API response wraps layout_data; preview_image is not returned by this endpoint.
  // We display the 3D planogram viewer via iframe and fall back to a placeholder.

  const shelfCodeDisplay = shelfMeta.shelfCode
    || `SHELF-A${layout.id}`

  return (
    <div className="shelf-page">
      {/* ── Header ── */}
      <header className="shelf-page__header">
        <button type="button" className="shelf-page__back" onClick={onBack}>
          &#8592; Back to store
        </button>
        <p className="shelf-page__eyebrow">AISLE {shelfMeta.aisleNumber}</p>
        <h1 className="shelf-page__title">{layout.name}</h1>
        <p className="shelf-page__code-row">
          Shelf code{' '}
          <span className="shelf-page__code-badge">{shelfCodeDisplay}</span>
        </p>
      </header>

      {/* ── 3D Planogram Viewer ── */}
      <div className="shelf-page__viewer-wrap">
        {layout.previewImage ? (
          <img
            src={layout.previewImage}
            alt={`${layout.name} 3D shelf view`}
            className="shelf-page__viewer-img"
          />
        ) : (
          <div className="shelf-page__viewer-fallback">
            <span>3D shelf preview unavailable</span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="shelf-page__body">
        {/* Search row */}
        <div className="shelf-page__search-row">
          <div className="shelf-page__search-wrap">
            <svg className="shelf-page__search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              className="shelf-page__search"
              placeholder="Search this shelf or store..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button type="button" className="shelf-page__search-btn">
            Search store
          </button>
        </div>

        {/* Products section */}
        <h2 className="shelf-page__products-heading">
          Products on this shelf ({loading ? '…' : filteredProducts.length})
        </h2>

        {loading && <p className="shelf-page__status">Loading shelf data…</p>}
        {error && <p className="shelf-page__error">{error}</p>}

        {!loading && !error && filteredProducts.length === 0 && (
          <p className="shelf-page__status">No products found{searchTerm ? ' for your search' : ' on this shelf'}.</p>
        )}

        <ul className="shelf-page__products" role="list">
          {filteredProducts.map((product, i) => {
            const key = product.id ?? i
            return (
              <ProductCard
                key={key}
                product={product}
                expanded={expandedId === key}
                onToggle={() => toggleProduct(key)}
              />
            )
          })}
        </ul>
      </div>

      {/* ── Floating QR scan button ── */}
      <button type="button" className="shelf-page__fab" aria-label="Scan QR code">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h2v2h-2zM18 14h3M14 18v3M18 18h3v3h-3z" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export default ShelfExperiencePage
