import { useEffect, useMemo, useRef, useState } from 'react'
// Read config for price field
const USE_US_PRICE = String(import.meta.env.VITE_USE_US_PRICE || '').toLowerCase() === 'true'
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk'
import { fetchLayoutById } from '../../services/planogramStoresApi'
import { fetchAllProductsFull, fetchAllProducts, fetchDirectProductDetails, getSpeechToken, sendChatQuery, fetchProductById } from '../../services/api'
import { fuzzyFilter } from '../../utils/fuzzySearch'
import './styles/ShelfExperiencePage.css'
import jsQR from "jsqr";

// Planogram 3D viewer host — override with VITE_PLANOGRAM_VIEWER_BASE_URL in .env for custom deployments.
const PLANOGRAM_VIEWER_BASE_URL = (import.meta.env.VITE_PLANOGRAM_VIEWER_BASE_URL || 'https://planogram.fcust.com').replace(/\/$/, '')

const trimValue = (value) => (typeof value === 'string' ? value.trim() : '')

const extractShelfIdFromQrText = (rawValue) => {
  const value = trimValue(rawValue)
  if (!value) {
    return ''
  }

  if (/^\d+$/.test(value)) {
    return value
  }

  try {
    const parsed = new URL(value)
    return (
      trimValue(parsed.searchParams.get('shelfId')) ||
      trimValue(parsed.searchParams.get('layoutId')) ||
      trimValue(parsed.searchParams.get('savedLayoutId')) ||
      trimValue(parsed.searchParams.get('shelf')) ||
      ''
    )
  } catch {
    const match = value.match(/(?:shelfId|layoutId|savedLayoutId|shelf)=([^&]+)/i)
    return match?.[1] ? decodeURIComponent(match[1]).trim() : ''
  }
}

const redirectToShelfById = (shelfId) => {
  if (!shelfId) {
    return
  }

  const target = new URL(window.location.href)
  target.searchParams.set('shelfId', shelfId)
  target.searchParams.delete('layoutId')
  target.searchParams.delete('savedLayoutId')
  target.searchParams.delete('shelf')

  window.location.assign(target.toString())
}
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
          price: USE_US_PRICE ? cat.US_Price ?? cat.us_price ?? null : cat.price ?? null,
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

const normalizeProductName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const pickConfiguredPrice = (source = {}) => {
  if (!source || typeof source !== 'object') return null
  if (USE_US_PRICE) {
    return source.US_Price ?? source.us_price ?? source.usprice ?? source.Price ?? source.price ?? null
  }
  return source.Price ?? source.price ?? source.final_price ?? source.Final_Price ?? null
}

const pickDisplayedPrice = (source = {}) => {
  if (!source || typeof source !== 'object') return null
  return source.final_price ?? source.Final_Price ?? source.discounted_price ?? source.discountedPrice ?? pickConfiguredPrice(source)
}

const extractUpcFromSourceId = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  // Common source formats: SKU_890123..., sku:890123..., or plain UPC value.
  const skuMatch = raw.match(/sku[_:\-\s]*([a-z0-9]+)/i)
  if (skuMatch?.[1]) return skuMatch[1]

  // Accept only numeric UPC-like values when not prefixed with SKU.
  if (/^\d{8,18}$/.test(raw)) return raw

  return ''
}

// function ProductCard({ product, expanded, onToggle }) {
//   const brandLabel = getBrandLabel(product)
//   const color = product.brand_color || getBrandColor(product.brand, product.name)
//   const inStock = product.stock_count == null ? true : Number(product.stock_count) > 0
//   const stockCount = product.stock_count ?? product.quantity

//   return (
//     <li className="shelf-product">
//       <button type="button" className="shelf-product__main" onClick={onToggle}>
//         <div
//           className="shelf-product__logo"
//           style={{ background: color }}
//           aria-hidden="true"
//         >
//           {brandLabel}
//         </div>
//         <div className="shelf-product__info">
//           <p className="shelf-product__name">{product.name || 'Unknown product'}</p>
//           <p className="shelf-product__meta">
//             {[product.category, product.price != null ? `$${Number(product.price).toFixed(2)}` : null]
//               .filter(Boolean)
//               .join(' · ')}
//           </p>
//         </div>
//         <div className="shelf-product__right">
//           {inStock ? (
//             <span className="shelf-product__badge shelf-product__badge--in">
//               {stockCount != null ? `${stockCount} in stock` : 'In stock'}
//             </span>
//           ) : (
//             <span className="shelf-product__badge shelf-product__badge--out">Out of stock</span>
//           )}
//           <span className={`shelf-product__chevron ${expanded ? 'is-open' : ''}`}>
//             &#8964;
//           </span>
//         </div>
//       </button>

//       {expanded && (
//         <div className="shelf-product__detail">
//           {product.description && (
//             <p className="shelf-product__desc">{product.description}</p>
//           )}
//           <div className="shelf-product__detail-grid">
//             {product.upc && <span><strong>UPC:</strong> {product.upc}</span>}
//             {product.heightInCm != null && <span><strong>Height:</strong> {product.heightInCm} cm</span>}
//             {product.widthInCm != null && <span><strong>Width:</strong> {product.widthInCm} cm</span>}
//             {product.depthInCm != null && <span><strong>Depth:</strong> {product.depthInCm} cm</span>}
//           </div>
//         </div>
//       )}
//     </li>
//   )
// }

const formatIngredients = (ingredients) => {
  if (Array.isArray(ingredients)) {
    return ingredients.join(', ');
  }
  if (typeof ingredients === 'string') {
    // Split on capital letters or common delimiters, then join with commas
    return ingredients
      .split(/(?=[A-Z])|\s*[,;]\s*/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(', ');
  }
  return '';
};

const parseNutrition = (facts) => {
  if (!facts) return { nutrients: [], ingredients: '' }
  let obj = null
  if (typeof facts === 'string') {
    try { obj = JSON.parse(facts) } catch { obj = null }
  } else if (typeof facts === 'object' && facts !== null) {
    obj = facts
  }
  if (obj && !Array.isArray(obj)) {
    const { ingredients, Ingredients, ...rest } = obj
    return {
      nutrients: Object.entries(rest).map(([k, v]) => ({ label: k, value: String(v) })),
      ingredients: ingredients || Ingredients || '',
    }
  }
  // Plain text — try comma-separated: "470, Protein: 14g, Total Fat: 22g, ..."
  // Also handles semicolon-separated: "Calories: 160 kcal; Fat: 10g; ..."
  const raw = String(facts)
  const nutrients = []
  let ingredients = ''
  // Split on "; " or ", " (but not inside values)
  const parts = raw.split(/;\s*|,\s*(?=[A-Z])/)
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const m = trimmed.match(/^([^:]+):\s*(.+)$/)
    if (m) {
      const label = m[1].trim()
      const value = m[2].trim()
      if (/ingredient/i.test(label)) ingredients = value
      else nutrients.push({ label, value })
    } else if (/^\d/.test(trimmed) && nutrients.length === 0) {
      // First token is a bare number → treat as Calories
      nutrients.push({ label: 'Calories', value: trimmed })
    }
  }
  return { nutrients, ingredients }
}

function ProductCard({ product, shelfFolder, expanded, onToggle, selected, onSelectToggle, source = 'shelf', isOffShelf = false, isAiResult = false }) {
  const EXTENSIONS = ['jpg', 'png', 'jpeg', 'webp']
  const brandLabel = product.brand ? product.brand.split(' ')[0] : (product.name || '?').split(' ')[0]
  const color = getBrandColor(product.brand, product.name)
  const inStock = product.stock_count == null ? true : Number(product.stock_count) > 0
  const stockCount = product.stock_count

  // Encode only characters that break URLs but may appear in product file names
  const encodeFileName = (n) => n.replace(/%/g, '%25').replace(/#/g, '%23').replace(/\?/g, '%3F')

  // Build candidate base paths in priority order:
  // 1. Cosmos image_url (authoritative),
  // 2. Layout subfolder + Cosmos name, 3. Layout subfolder + original layout name (preserves apostrophes matching actual file)
  // 4. Flat /images/ root with both name variants
  const buildCandidates = () => {
    const cosmosName = product.name || ''
    const layoutName = product.layoutName || cosmosName
    // Also try variant where % → " Percent" to match files saved with word "Percent"
    const percentVariant = (n) => n.replace(/%/g, ' Percent').replace(/\s{2,}/g, ' ').trim()
    // Collect unique name variants (Cosmos-enriched name + original layout name + percent-word variants)
    const nameVariants = [...new Set(
      [cosmosName, layoutName, percentVariant(cosmosName), percentVariant(layoutName)].filter(Boolean)
    )]
    const list = []
    if (product.image_url) {
      list.push(`/${product.image_url.replace(/^\//, '').replace(/\.[^.]+$/, '')}`)
    }
    for (const n of nameVariants) {
      const enc = encodeFileName(n)
      if (shelfFolder) list.push(`/images/${shelfFolder}/${enc}`)
      list.push(`/images/${enc}`)
    }
    return list
  }

  const candidates = buildCandidates()
  const total = candidates.length * EXTENSIONS.length
  const [attempt, setAttempt] = useState(0)
  const showImage = attempt < total
  const imgSrc = showImage
    ? `${candidates[Math.floor(attempt / EXTENSIONS.length)]}.${EXTENSIONS[attempt % EXTENSIONS.length]}`
    : null

  const handleImgError = () => setAttempt((a) => a + 1)

  const { nutrients, ingredients: parsedIngredients } = parseNutrition(product.nutritional_facts)
  const ingredientsList = product.ingredients || parsedIngredients
  const formattedIngredients = formatIngredients(ingredientsList)
  const renderSourceBadge = (extraClass = '') => (
    source === 'chat' ? (
      <span className={`shelf-product__source-badge shelf-product__source-badge--${isOffShelf ? 'offshelft' : 'chat'} ${extraClass}`.trim()}>
        {isOffShelf ? (
          <>
            {/* <span className="shelf-product__source-badge-text">From AI</span> */}
            <span className="shelf-product__source-badge-sub">(not on shelf)</span>
          </>
        ) : (
          <span className="shelf-product__source-badge-text">From AI</span>
        )}
      </span>
    ) : null
  )

  return (
    <li className={`shelf-product ${isAiResult ? 'shelf-product--ai-result' : ''}`}>
      <div
        className="shelf-product__main"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
      >
        {showImage ? (
          <img
            src={imgSrc}
            alt={product.name}
            className="shelf-product__img"
            onError={handleImgError}
          />
        ) : (
          <div
            className="shelf-product__logo"
            style={{ background: color }}
            aria-hidden="true"
          >
            {brandLabel}
          </div>
        )}
        <div className="shelf-product__info">
          <div className="shelf-product__header">
            <p className="shelf-product__name">{product.name || 'Unknown product'}</p>
            {renderSourceBadge('shelf-product__source-badge--desktop')}
          </div>
          <p className="shelf-product__meta">
            {[product.category, product.price != null ? `${USE_US_PRICE ? '$' : '₹'}${Number(product.price).toFixed(2)}` : null]
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
          <button
            type="button"
            className={`shelf-product__select-btn ${selected ? 'is-selected' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onSelectToggle()
            }}
            aria-pressed={selected}
          >
            <span>{selected ? 'Added' : 'Explore'}</span>
          </button>
          {renderSourceBadge('shelf-product__source-badge--mobile')}
          <span className={`shelf-product__chevron ${expanded ? 'is-open' : ''}`}>&#8964;</span>
        </div>
      </div>

      {expanded && (
        <div className="shelf-product__detail">
          <div className="shelf-product__detail-layout">
            {/* Large image or brand colour fallback */}
            <div className="shelf-product__detail-img-wrap" style={{ background: color }}>
              {showImage ? (
                <img src={imgSrc} alt={product.name} className="shelf-product__detail-big-img" />
              ) : (
                <span className="shelf-product__detail-img-fallback">{brandLabel}</span>
              )}
            </div>

            {/* Info panel */}
            <div className="shelf-product__detail-right">
              <div className="shelf-product__detail-title-row">
                <p className="shelf-product__detail-name">{product.name}</p>
                {product.price != null && (
                  <span className="shelf-product__detail-price">{USE_US_PRICE ? '$' : '₹'}{Number(product.price).toFixed(2)}</span>
                )}
              </div>
              {product.category && (
                <p className="shelf-product__detail-cat">{product.category}</p>
              )}
              {product.diet_type && (
                <div className="shelf-product__detail-badges">
                  <span className="shelf-product__detail-badge">🌿 {product.diet_type}</span>
                </div>
              )}
              {product.description && (
                <p className="shelf-product__detail-desc">{product.description}</p>
              )}
              {nutrients.length > 0 && (
                <>
                  <p className="shelf-product__detail-section-heading">
                    <strong>Nutrition</strong>&nbsp;<span className="shelf-product__detail-section-sub">(per serving)</span>
                  </p>
                  <div className="shelf-product__nutr-grid">
                    {nutrients.map(({ label, value }) => (
                      <div key={label} className="shelf-product__nutr-row">
                        <span className="shelf-product__nutr-label">{label}</span>
                        <span className="shelf-product__nutr-value">{value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {formattedIngredients && (
                <>
                  <p className="shelf-product__detail-section-heading"><strong>Ingredients</strong></p>
                  <p className="shelf-product__detail-ingredients">{formattedIngredients}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

function ShelfExperiencePage({ store, layout, onBack, onQrShelfDetected, isQrLoading = false }) {
  const [fullLayout, setFullLayout] = useState(null)
  const [products, setProducts] = useState([])
  const [shelfMeta, setShelfMeta] = useState({ aisleNumber: '1', shelfCode: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  // WhatsApp-style chat history: array of {role: 'user'|'ai', text: string}
  const [chatHistory, setChatHistory] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [chatProducts, setChatProducts] = useState([])
  const [allStoreProducts, setAllStoreProducts] = useState([])
  const [dropdownResults, setDropdownResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState([])
  const [scanOpen, setScanOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [speechError, setSpeechError] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [qrMessage, setQrMessage] = useState('')
  const [qrScanned, setQrScanned] = useState(false)
  const [highlightedProduct, setHighlightedProduct] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const speechRecognizerRef = useRef(null)
  const canvasRef = useRef(null)
  const qrScanLoopRef = useRef(null)
  const chatHistoryRef = useRef(null)
  const catalogProductsRef = useRef(null)

  const viewerHighlightedProducts = useMemo(() => {
    const shelfNameByNormalized = new Map()
    products.forEach((product) => {
      const normalized = normalizeProductName(product?.name)
      if (normalized && !shelfNameByNormalized.has(normalized)) {
        shelfNameByNormalized.set(normalized, product?.layoutName || product?.name || '')
      }
    })

    const matchedSelected = selectedProducts
      .map((product) => {
        const candidateNames = [
          product?.layoutName,
          product?.name,
          product?.product_name,
          product?.ProductName,
        ]

        for (const candidate of candidateNames) {
          const normalized = normalizeProductName(candidate)
          if (!normalized) continue
          if (shelfNameByNormalized.has(normalized)) {
            return shelfNameByNormalized.get(normalized)
          }
        }

        return ''
      })
      .filter(Boolean)

    const merged = [...matchedSelected]
    if (highlightedProduct) {
      merged.push(highlightedProduct)
    }

    const seen = new Set()
    return merged.filter((name) => {
      const normalized = normalizeProductName(name)
      if (!normalized || seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
  }, [products, selectedProducts, highlightedProduct])

  const viewerHighlightQuery = useMemo(() => {
    if (viewerHighlightedProducts.length === 0) return ''
    const repeatedHighlights = viewerHighlightedProducts
      .map((name) => `&highlightProducts=${encodeURIComponent(name)}`)
      .join('')
    return `${repeatedHighlights}&maskOthers=true&maskColor=%23111111&maskOpacity=0.72`
  }, [viewerHighlightedProducts])

  const handleShareLink = async () => {
    const shareUrl = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({
          title: layout?.name || 'Shelf view',
          url: shareUrl,
        })
        return
      }
      await navigator.clipboard.writeText(shareUrl)
      setChatHistory((prev) => [...prev, { role: 'ai', text: 'Link copied to clipboard.' }])
    } catch {
      setChatHistory((prev) => [...prev, { role: 'ai', text: 'Unable to share link right now.' }])
    }
  }

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
        setShelfMeta(parseShelfMeta(layoutData))

        // Get all products listed in this shelf from the layout plan (authoritative list)
        const layoutProducts = parseProducts(layoutData)

        // Fetch full product details from Cosmos
        const allCosmosProducts = await fetchAllProductsFull()

        // Normalize name for fuzzy matching: lowercase, strip ALL punctuation
        const normalizeName = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s()]/g, '').replace(/\s+/g, ' ').trim()

        // Build lookup map: normalized name → cosmos product
        const cosmosMap = {}
        for (const p of allCosmosProducts) {
          const key = normalizeName(p.Name || p.name)
          if (key) cosmosMap[key] = p
        }

        // Fetch configured price from direct endpoint using UPC and map it by UPC
        const uniqueUpcs = [...new Set(
          layoutProducts
            .map((lp) => {
              const key = normalizeName(lp.name)
              const cp = cosmosMap[key]
              return cp ? (cp.UPC || cp.upc || lp.upc || '') : (lp.upc || '')
            })
            .filter(Boolean)
            .map((u) => String(u))
        )]
        const priceMap = {}
        await Promise.all(uniqueUpcs.map(async (upc) => {
          try {
            const res = await fetchDirectProductDetails(upc)
            const payload = res?.data ?? res
            const discountedPrice =
              pickDisplayedPrice(payload)
              ?? pickDisplayedPrice(payload?.inventory)
              ?? pickDisplayedPrice(payload?.inventory_record)
              ?? pickDisplayedPrice(payload?.inventoryData)
            if (discountedPrice != null && discountedPrice !== '') priceMap[upc] = discountedPrice
          } catch {
            // Keep graceful fallback to bulk price when direct endpoint fails for an item.
          }
        }))

        // For every product in the shelf, use Cosmos data if name matches, else fallback to layout data
        const shelfProducts = layoutProducts.map((lp) => {
          const key = normalizeName(lp.name)
          const cp = cosmosMap[key]
          const resolvedUpc = cp ? (cp.UPC || cp.upc || lp.upc || '') : (lp.upc || '')
          return {
            id:               cp ? (cp.id || cp.UPC || cp.upc || lp.id || lp.name) : (lp.id || lp.name),
            name:             cp ? (cp.Name || cp.name || lp.name) : lp.name,
            layoutName:       lp.name,
            brand:            cp ? (cp.Brand || cp.brand || lp.brand) : lp.brand,
            category:         cp ? (cp.Category || cp.category || lp.category) : lp.category,
            description:      cp ? (cp.Description || cp.description || '') : '',
            nutritional_facts:cp ? (cp.Nutritional_Facts || cp.nutritional_facts || '') : '',
            upc:              cp ? (cp.UPC || cp.upc || lp.upc) : lp.upc,
            image_url:        cp ? (cp.image_url || cp.imageUrl || '') : '',
            price:            priceMap[String(resolvedUpc)]
              ?? (cp
                ? (USE_US_PRICE
                    ? (cp.US_Price ?? cp.us_price ?? cp.usprice ?? cp.Price ?? cp.price ?? lp.US_Price ?? lp.us_price ?? lp.usprice ?? lp.price ?? null)
                    : (cp.Price ?? cp.price ?? lp.price ?? null)
                  )
                : (USE_US_PRICE
                    ? (lp.US_Price ?? lp.us_price ?? lp.usprice ?? lp.price ?? null)
                    : (lp.price ?? null)
                  )
              ),
            diet_type:        cp ? (cp.Diet_Type || cp.diet_type || cp.Tags || cp.tags || '') : '',
            ingredients:      cp ? (cp.Ingredients || cp.ingredients || '') : '',
            stock_count:      lp.stock_count,
          }
        })

        if (!cancelled) setProducts(shelfProducts)
      } catch {
        if (!cancelled) setError('Failed to load shelf data from planogram.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [layout.id])

  // Load all store products once for the search dropdown
  useEffect(() => {
    fetchAllProducts()
      .then((res) => setAllStoreProducts(res.data || []))
      .catch(() => {})
  }, [])

  // Live-filter dropdown as user types (fuzzy — handles punctuation, typos, spacing)
  useEffect(() => {
    if (!searchTerm.trim()) { setDropdownResults([]); setShowDropdown(false); return }
    const filtered = fuzzyFilter(allStoreProducts, searchTerm)
    setDropdownResults(filtered)
  }, [searchTerm, allStoreProducts])

  useEffect(() => {
    if (!chatHistoryRef.current) return
    chatHistoryRef.current.scrollTo({
      top: chatHistoryRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [chatHistory])

  const getSelectedProductLabels = () =>
    selectedProducts
      .map((product) => product.name || product.product_name || product.ProductName || '')
      .filter(Boolean)

  const queryMentionsSelectedProduct = (query, productLabels) => {
    const normalizedQuery = query.toLowerCase()
    return productLabels.some((label) => {
      const normalizedLabel = label.toLowerCase().trim()
      return normalizedLabel && normalizedQuery.includes(normalizedLabel)
    })
  }

  const clearChatHistory = () => {
    setChatHistory([])
    setChatProducts([])
    setExpandedId(null)
    setHighlightedProduct('')
  }

  const isQuestionInput = (value) => {
    const text = value.trim()
    if (!text) return false
    return /\?|\b(what|which|where|when|why|how|can|should|tell|show|find|recommend)\b/i.test(text)
  }

  const buildMessagesFromHistory = (history) => {
    const mapped = history
      .filter((m) => m.role === 'user' || m.role === 'ai')
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }))
    return mapped
  }

  // When user picks a product from the dropdown:
  // - if it's on this shelf, expand its card and show details
  // - if not, show a message and ask AI which shelf it's in
  const handleSelectProduct = async (storeProduct) => {
    const pickedName = (storeProduct.name || '').toLowerCase().trim()
    const selectedLabel = storeProduct.name || ''
    setChatProducts([])

    setSelectedProducts((prev) => {
      const selectedId = storeProduct.id || storeProduct.name || storeProduct.product_name
      const alreadySelected = prev.find((product) => (product.id || product.name || product.product_name) === selectedId)
      return alreadySelected
        ? prev.filter((product) => (product.id || product.name || product.product_name) !== selectedId)
        : [...prev, storeProduct]
    })

    setShowDropdown(false)
    setSearchTerm('')

    const shelfMatch = products.find(
      (p) => (p.name || '').toLowerCase().trim() === pickedName
    )

    if (shelfMatch) {
      const key = shelfMatch.id ?? products.indexOf(shelfMatch)
      setExpandedId(key)
      // Use the original layout name for highlighting (matches planogram's product names exactly)
      setHighlightedProduct(shelfMatch.layoutName || shelfMatch.name || '')
      const lines = [
        shelfMatch.name,
        shelfMatch.brand        && `Brand: ${shelfMatch.brand}`,
        shelfMatch.category     && `Category: ${shelfMatch.category}`,
        shelfMatch.description  && `\n${shelfMatch.description}`,
      ].filter(Boolean).join('  ·  ')
      setChatHistory((prev) => [
        ...prev,
        { role: 'user', text: selectedLabel },
        { role: 'ai', text: `✅ Found on this shelf\n\n${lines}` }
      ])
    } else {
      setHighlightedProduct('')
      setChatHistory((prev) => [
        ...prev,
        { role: 'user', text: selectedLabel },
        { role: 'ai', text: 'Searching...' }
      ])
      try {
        const storeName = store?.name || 'this store'
        const shelfName = layout?.name || 'this shelf'
        const userQuery = `The product "${selectedLabel}" is not on "${shelfName}". Which shelf or section would I find it? Please be specific.`
        const messages = buildMessagesFromHistory(chatHistory)
        const res = await sendChatQuery(userQuery, messages)
        setChatHistory((prev) => [
          ...prev.slice(0, -1), // Remove 'Searching...'
          { role: 'ai', text: `⚠️ "${selectedLabel}" is not on this shelf.\n\n${res.answer || 'Unable to determine which shelf this product is on.'}` }
        ])
      } catch {
        setChatHistory((prev) => [
          ...prev.slice(0, -1),
          { role: 'ai', text: `⚠️ "${selectedLabel}" is not available on this shelf.` }
        ])
      }
    }
  }

  const removeSelected = (product) => {
    const selectedId = product.id || product.name || product.product_name
    setSelectedProducts((prev) => prev.filter((item) => (item.id || item.name || item.product_name) !== selectedId))
  }

  const toggleSelectedProduct = (product) => {
    const selectedId = product.id || product.name || product.product_name
    setSelectedProducts((prev) => {
      const alreadySelected = prev.some((item) => (item.id || item.name || item.product_name) === selectedId)
      return alreadySelected
        ? prev.filter((item) => (item.id || item.name || item.product_name) !== selectedId)
        : [...prev, product]
    })
  }

  const isProductSelected = (product) => {
    const selectedId = product.id || product.name || product.product_name
    return selectedProducts.some((item) => (item.id || item.name || item.product_name) === selectedId)
  }

  const normalizeFieldKey = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')

  const isNonEmptyValue = (value) => value !== undefined && value !== null && value !== ''

  const getPayloadSources = (payload) => {
    if (!payload || typeof payload !== 'object') return []

    const sources = [payload]
    const nestedKeys = ['data', 'product', 'product_info', 'productInfo', 'details', 'detail', 'item', 'metadata']

    for (const key of nestedKeys) {
      const nested = payload?.[key]
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        sources.push(nested)
      }
    }

    return sources
  }

  const readFirstValue = (payload, keys) => {
    const sources = getPayloadSources(payload)
    if (sources.length === 0) return ''

    const normalizedKeySet = new Set(keys.map((key) => normalizeFieldKey(key)))

    for (const source of sources) {
      for (const key of keys) {
        const value = source?.[key]
        if (isNonEmptyValue(value)) {
          return value
        }
      }

      for (const [field, value] of Object.entries(source)) {
        if (!isNonEmptyValue(value)) continue
        if (normalizedKeySet.has(normalizeFieldKey(field))) {
          return value
        }
      }
    }

    return ''
  }

  const mapFetchedPayloadToProduct = (payload, fallbackValue) => {
    if (!payload) return null

    const resolvedName = readFirstValue(payload, ['name', 'Name', 'product_name', 'ProductName', 'productName'])
    if (!resolvedName && !fallbackValue) return null

    return {
      ...payload,
      name: resolvedName || fallbackValue,
      brand: readFirstValue(payload, ['brand', 'Brand']),
      category: readFirstValue(payload, ['category', 'Category']),
      description: readFirstValue(payload, ['description', 'Description']),
      nutritional_facts: readFirstValue(payload, ['nutritional_facts', 'Nutritional_Facts', 'Nutritional Facts', 'nutrition_facts', 'nutrition', 'nutrition_data']),
      image_url: readFirstValue(payload, ['image_url', 'imageUrl', 'Image_URL', 'ImageUrl']),
      upc: readFirstValue(payload, ['upc', 'UPC']),
      price: pickDisplayedPrice(payload),
      diet_type: readFirstValue(payload, ['diet_type', 'Diet_Type', 'Diet Type', 'Tags', 'tags']),
      ingredients: readFirstValue(payload, ['ingredients', 'Ingredients', 'Ingredient_List', 'ingredient_list', 'ingredient', 'Ingredients_List']),
      id: readFirstValue(payload, ['id', 'UPC', 'upc']) || fallbackValue,
    }
  }

  const hasCompleteDetails = (product) =>
    Boolean(product?.description) && Boolean(product?.nutritional_facts) && Boolean(product?.ingredients)

  const getCatalogProducts = async () => {
    if (Array.isArray(catalogProductsRef.current)) {
      return catalogProductsRef.current
    }

    try {
      const items = await fetchAllProductsFull()
      catalogProductsRef.current = Array.isArray(items) ? items : []
    } catch {
      catalogProductsRef.current = []
    }

    return catalogProductsRef.current
  }

  const enrichProductDetails = async (product, fallbackValue = '') => {
    if (!product || hasCompleteDetails(product)) return product

    const lookupCandidates = [product.upc, product.id, product.name, fallbackValue]
      .map((value) => String(value || '').trim())
      .filter(Boolean)

    for (const lookup of lookupCandidates) {
      try {
        const result = await fetchProductById(lookup)
        const raw = result?.data ?? result
        const payload = Array.isArray(raw) ? raw[0] : raw
        const mapped = mapFetchedPayloadToProduct(payload, lookup)
        if (!mapped) continue

        return {
          ...mapped,
          ...product,
          name: product.name || mapped.name,
          brand: product.brand || mapped.brand,
          category: product.category || mapped.category,
          description: product.description || mapped.description,
          nutritional_facts: product.nutritional_facts || mapped.nutritional_facts,
          ingredients: product.ingredients || mapped.ingredients,
          diet_type: product.diet_type || mapped.diet_type,
          image_url: product.image_url || mapped.image_url,
          upc: product.upc || mapped.upc,
          price: product.price ?? mapped.price ?? null,
          id: product.id || mapped.id,
        }
      } catch {
        // Try next candidate lookup.
      }
    }

    // Final fallback: search full catalog and merge details by UPC or normalized name.
    const catalogProducts = await getCatalogProducts()
    if (catalogProducts.length > 0) {
      const normalizedName = normalizeProductName(product.name || fallbackValue)
      const matchedCatalog = catalogProducts.find((item) => {
        const itemUpc = String(readFirstValue(item, ['upc', 'UPC']) || '').trim()
        const productUpc = String(product.upc || '').trim()
        if (productUpc && itemUpc && productUpc === itemUpc) return true

        const itemName = normalizeProductName(readFirstValue(item, ['name', 'Name', 'product_name', 'ProductName']))
        return normalizedName && itemName && normalizedName === itemName
      })

      if (matchedCatalog) {
        const mappedCatalog = mapFetchedPayloadToProduct(matchedCatalog, fallbackValue)
        if (mappedCatalog) {
          return {
            ...mappedCatalog,
            ...product,
            name: product.name || mappedCatalog.name,
            brand: product.brand || mappedCatalog.brand,
            category: product.category || mappedCatalog.category,
            description: product.description || mappedCatalog.description,
            nutritional_facts: product.nutritional_facts || mappedCatalog.nutritional_facts,
            ingredients: product.ingredients || mappedCatalog.ingredients,
            diet_type: product.diet_type || mappedCatalog.diet_type,
            image_url: product.image_url || mappedCatalog.image_url,
            upc: product.upc || mappedCatalog.upc,
            price: product.price ?? mappedCatalog.price ?? null,
            id: product.id || mappedCatalog.id,
          }
        }
      }
    }

    return product
  }

  const fetchProductsByUpcs = async (upcs) => {
    const fetched = []
    const seen = new Set()

    for (const upcValue of upcs) {
      const upc = String(upcValue || '').trim()
      if (!upc || seen.has(upc)) continue
      seen.add(upc)

      const shelfMatch = products.find((p) => String(p.upc || p.id || '').trim() === upc)
      if (shelfMatch) {
        fetched.push(shelfMatch)
        continue
      }

      try {
        const result = await fetchDirectProductDetails(upc)
        const raw = result?.data ?? result
        const payload = Array.isArray(raw) ? raw[0] : raw
        const mapped = mapFetchedPayloadToProduct(payload, upc)
        if (mapped) {
          const enriched = await enrichProductDetails(mapped, upc)
          fetched.push(enriched)
        }
      } catch {
        // Skip this source UPC when lookup fails.
      }
    }

    return fetched
  }

  const fetchProductsByNames = async (names) => {
    const fetched = []
    const seen = new Set()

    for (const name of names) {
      const normalized = normalizeProductName(name)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)

      // First, try to match against shelf products by normalized name (fuzzy match)
      const shelfMatch = products.find((p) => normalizeProductName(p.name) === normalized)
      
      if (shelfMatch) {
        fetched.push(shelfMatch)
        continue
      }

      let mapped = null

      // Fallback: try to fetch from DB using the name as ID (for products not on shelf)
      try {
        const result = await fetchProductById(name)
        const raw = result?.data ?? result
        const payload = Array.isArray(raw) ? raw[0] : raw
        mapped = mapFetchedPayloadToProduct(payload, name)
      } catch {
        // Continue to catalog fallback.
      }

      if (!mapped) {
        const catalogProducts = await getCatalogProducts()
        const catalogMatch = catalogProducts.find((item) => {
          const itemName = normalizeProductName(readFirstValue(item, ['name', 'Name', 'product_name', 'ProductName']))
          return normalized === itemName
        })

        if (catalogMatch) {
          mapped = mapFetchedPayloadToProduct(catalogMatch, name)
        }
      }

      if (mapped) {
        const enriched = await enrichProductDetails(mapped, name)
        fetched.push(enriched)
      }
    }

    return fetched
  }

  const handleAskAI = async (overrideQuery) => {
    const query = String(overrideQuery ?? searchTerm).trim()
    if (!query) return
    setShowDropdown(false)
    setSearchTerm('')
    setChatProducts([])

    const selectedLabels = getSelectedProductLabels()
    const scopedQuery =
      selectedLabels.length > 0 && !queryMentionsSelectedProduct(query, selectedLabels)
        ? `Answer only for these selected shelf products: ${selectedLabels.join(', ')}. User question: ${query}`
        : query

    setChatHistory((prev) => [
      ...prev,
      { role: 'user', text: query },
      { role: 'ai', text: 'Thinking...' }
    ])

    try {
      const messages = buildMessagesFromHistory(chatHistory)
      const res = await sendChatQuery(scopedQuery, messages)
      setChatHistory((prev) => [
        ...prev.slice(0, -1), // Remove 'Thinking...'
        { role: 'ai', text: res.answer || JSON.stringify(res) }
      ])
      const sourcePayload = res.sources ?? res.docs
      const rawSources = Array.isArray(sourcePayload)
        ? sourcePayload
        : (Array.isArray(sourcePayload?.results) ? sourcePayload.results : [])
      const answerText = res.answer || ''

      const extractNamesFromTextList = (text) => {
        if (!text) return []
        const lines = String(text)
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)

        const extracted = []
        for (const line of lines) {
          const numbered = line.match(/^\d+\.\s+(.+)$/)
          const bulleted = line.match(/^[-*]\s+(.+)$/)
          const raw = numbered?.[1] || bulleted?.[1] || ''
          if (!raw) continue

          const [beforeHyphen] = raw.split(/\s[-–—]\s/)
          const cleaned = beforeHyphen
            .replace(/\bprice\s*[:\-].*$/i, '')
            .replace(/[.;:,]\s*$/, '')
            .trim()

          if (cleaned.length >= 3) extracted.push(cleaned)
        }

        const unique = []
        const seen = new Set()
        extracted.forEach((name) => {
          const normalized = normalizeProductName(name)
          if (!normalized || seen.has(normalized)) return
          seen.add(normalized)
          unique.push(name)
        })
        return unique
      }

      const allKnownNames = [
        ...products.map((p) => p?.name || p?.product_name || p?.ProductName || ''),
        ...allStoreProducts.map((p) => p?.name || p?.product_name || p?.ProductName || p?.Name || ''),
      ]
        .map((name) => String(name || '').trim())
        .filter(Boolean)

      const answerLineNames = extractNamesFromTextList(answerText)

      const sourceTextValues = rawSources
        .flatMap((d) => {
          if (typeof d === 'string') return [d]
          return [
            d?.product,
            d?.name,
            d?.ProductName,
            d?.product_name,
            d?.title,
            d?.text,
            d?.content,
            d?.page_content,
            d?.summary,
            d?.chunk,
          ]
        })
        .map((v) => String(v || '').trim())
        .filter(Boolean)

      const sourceLineNames = extractNamesFromTextList(sourceTextValues.join('\n'))

      const nameByNormalized = new Map()
      ;[...allKnownNames, ...answerLineNames, ...sourceLineNames].forEach((name) => {
        const normalized = normalizeProductName(name)
        if (!normalized || nameByNormalized.has(normalized)) return
        nameByNormalized.set(normalized, name)
      })

      const normalizedAnswer = normalizeProductName(answerText)
      const answerNameSet = new Set()
      answerLineNames.forEach((name) => {
        const normalized = normalizeProductName(name)
        if (normalized) answerNameSet.add(normalized)
      })
      nameByNormalized.forEach((name, normalized) => {
        if (normalizedAnswer && normalizedAnswer.includes(normalized)) {
          answerNameSet.add(normalized)
        }
      })

      const sourceUpcs = rawSources
        .map((d) => {
          if (typeof d === 'string') return ''
          return extractUpcFromSourceId(
            d?.id || d?.source_id || d?.doc_id || d?.sku || d?.SKU || d?.product_id || ''
          )
        })
        .filter(Boolean)

      const sourceNameValues = rawSources
        .map((d) => (typeof d === 'string' ? d : (d?.product || d?.name || d?.ProductName || d?.product_name || d?.title || d?.description || '')))
        .map((s) => String(s || '').trim())
        .filter(Boolean)

      const sourceNameSet = new Set(
        sourceNameValues
          .map((name) => normalizeProductName(name))
          .filter(Boolean)
      )
      sourceLineNames.forEach((name) => {
        const normalized = normalizeProductName(name)
        if (normalized) sourceNameSet.add(normalized)
      })

      const normalizedSourceBlob = normalizeProductName(sourceTextValues.join(' '))
      nameByNormalized.forEach((_, normalized) => {
        if (normalizedSourceBlob && normalizedSourceBlob.includes(normalized)) {
          sourceNameSet.add(normalized)
        }
      })

      const responseProductNames = Array.isArray(res.product_names)
        ? res.product_names.map((name) => String(name || '').trim()).filter(Boolean)
        : []

      // Prefer backend-provided product_names from chat response.
      let chatProds = []
      if (responseProductNames.length > 0) {
        chatProds = await fetchProductsByNames(responseProductNames)
      } else {
        if (sourceUpcs.length > 0) {
          chatProds = await fetchProductsByUpcs(sourceUpcs)
        }

        if (sourceNameValues.length > 0) {
          const nameProducts = await fetchProductsByNames(sourceNameValues)
          const seen = new Set(
            chatProds
              .map((p) => normalizeProductName(p?.name || p?.product_name || p?.ProductName || p?.id || ''))
              .filter(Boolean)
          )

          nameProducts.forEach((p) => {
            const key = normalizeProductName(p?.name || p?.product_name || p?.ProductName || p?.id || '')
            if (!key || seen.has(key)) return
            seen.add(key)
            chatProds.push(p)
          })
        }

        if (chatProds.length === 0 && rawSources.length > 0) {
          const sourceFallbackProducts = rawSources
            .map((item, index) => {
              if (!item || typeof item === 'string') return null

              const sourceId = item?.id || item?.source_id || item?.doc_id || item?.sku || item?.SKU || item?.product_id || ''
              const derivedUpc = extractUpcFromSourceId(sourceId)

              return {
                id: sourceId || item?.product_id || `source-${index}`,
                name: item?.name || item?.product || item?.product_name || item?.ProductName || item?.title || answerLineNames[index] || sourceId || `Product ${index + 1}`,
                brand: item?.brand || '',
                category: item?.category || '',
                description: item?.description || '',
                image_url: item?.image_url || item?.imageUrl || '',
                upc: derivedUpc || '',
                price: pickDisplayedPrice(item),
                stock_count: item?.stock ?? item?.quantity ?? null,
              }
            })
            .filter(Boolean)

          chatProds = sourceFallbackProducts
        }
      }

      setChatProducts(chatProds)
    } catch (err) {
      setChatHistory((prev) => [
        ...prev.slice(0, -1),
        { role: 'ai', text: 'Error: ' + err.message }
      ])
      setChatProducts([])
    }
  }

  const filteredProducts = searchTerm ? fuzzyFilter(products, searchTerm) : products

  // Pinned ordering: selected first, then chat-source results, then remaining shelf products — no duplicates
  // Track source for each product: 'selected', 'chat', or 'shelf'
  const displayedProducts = useMemo(() => {
    const seen = new Set()
    const ordered = []
    const addUnique = (p, source = 'shelf') => {
      if (!p) return
      const key = normalizeProductName(p.name || p.product_name || p.ProductName || String(p.id || ''))
      if (!key || seen.has(key)) return
      seen.add(key)
      // For selected/chat items that are lightweight, try to fill from the enriched shelf list
      const shelfVersion = products.find((sp) => normalizeProductName(sp.name) === key)
      const finalProduct = shelfVersion || p
      // Mark source: if found on shelf, it's from shelf; otherwise keep the original source
      finalProduct._source = shelfVersion ? 'shelf' : source
      ordered.push(finalProduct)
    }
    selectedProducts.forEach((p) => addUnique(p, 'selected'))
    chatProducts.forEach((p) => addUnique(p, 'chat'))
    filteredProducts.forEach((p) => addUnique(p, 'shelf'))
    return ordered
  }, [selectedProducts, chatProducts, filteredProducts, products])

  const aiResultNameSet = useMemo(() => {
    const names = chatProducts
      .map((product) => normalizeProductName(product.name || product.product_name || product.ProductName || ''))
      .filter(Boolean)
    return new Set(names)
  }, [chatProducts])

  const toggleProduct = (key, product) => {
    setExpandedId((prev) => {
      const nextExpanded = prev === key ? null : key
      setHighlightedProduct(nextExpanded ? (product?.layoutName || product?.name || '') : '')
      return nextExpanded
    })
  }

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera is not available on this browser.')
      return
    }
    try {
      setCameraError('')
      setQrMessage('Point the camera at a shelf QR code.')
      setQrScanned(false)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }
      streamRef.current = stream
      setIsCameraActive(true)
    } catch {
      setCameraError('Camera access failed.')
      setIsCameraActive(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setIsCameraActive(false)
  }

  useEffect(() => {
    const attachStream = async () => {
      if (!isCameraActive || !videoRef.current || !streamRef.current) return
      videoRef.current.srcObject = streamRef.current
      try { await videoRef.current.play() } catch { setCameraError('Camera started but video playback failed.') }
    }
    attachStream()
  }, [isCameraActive])

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (!isCameraActive || !videoRef.current || !canvasRef.current || qrScanned || isQrLoading) {
      return undefined
    }

    const scanQr = async () => {
      if (!videoRef.current || !canvasRef.current || qrScanned || isQrLoading) {
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas.getContext('2d', { willReadFrequently: true })

      if (!context) {
        setCameraError('QR scanning is not supported on this device.')
        return
      }

      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        qrScanLoopRef.current = requestAnimationFrame(scanQr)
        return
      }

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        const qrResult = jsQR(imageData.data, imageData.width, imageData.height)

        if (qrResult?.data) {
          const shelfId = extractShelfIdFromQrText(qrResult.data)

          if (shelfId) {
            setQrScanned(true)
            setQrMessage(`Shelf ${shelfId} detected. Opening...`)
            setCameraError('')
            stopCamera()

            try {
              if (onQrShelfDetected) {
                await onQrShelfDetected(shelfId)
              } else {
                redirectToShelfById(shelfId)
              }
              setScanOpen(false)
            } catch {
              setQrScanned(false)
              setCameraError('QR scanned, but the shelf could not be opened.')
              setQrMessage('')
            }
            return
          }

          setCameraError('QR scanned, but no valid shelfId was found in the QR content.')
        }
      } catch {
        // Continue scanning until a valid QR code is found.
      }

      qrScanLoopRef.current = requestAnimationFrame(scanQr)
    }

    qrScanLoopRef.current = requestAnimationFrame(scanQr)

    return () => {
      if (qrScanLoopRef.current) {
        cancelAnimationFrame(qrScanLoopRef.current)
        qrScanLoopRef.current = null
      }
    }
  }, [isCameraActive, qrScanned, isQrLoading, onQrShelfDetected])

  useEffect(() => {
    return () => {
      if (speechRecognizerRef.current) {
        speechRecognizerRef.current.close()
        speechRecognizerRef.current = null
      }
    }
  }, [])

  const handleVoiceSearch = async () => {
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
            void handleAskAI(result.text)
          } else if (result.reason === SpeechSDK.ResultReason.NoMatch) {
            setSpeechError('No speech was recognized. Please try again.')
          } else if (result.reason === SpeechSDK.ResultReason.Canceled) {
            setSpeechError('Voice search was canceled. Please try again.')
          }

          recognizer.close()
          if (speechRecognizerRef.current === recognizer) {
            speechRecognizerRef.current = null
          }
          setIsListening(false)
        },
        (err) => {
          setSpeechError(err?.message || 'Voice search failed. Please try again.')
          recognizer.close()
          if (speechRecognizerRef.current === recognizer) {
            speechRecognizerRef.current = null
          }
          setIsListening(false)
        }
      )
    } catch (err) {
      setSpeechError(err?.message || 'Voice search failed. Please try again.')
      setIsListening(false)
    }
  }

  // The API response wraps layout_data; preview_image is not returned by this endpoint.
  // We display the 3D planogram viewer via iframe and fall back to a placeholder.

  return (
    <div className="shelf-page">
      {/* ── Header ── */}
      <header className="shelf-page__header">
        <button type="button" className="shelf-page__back" onClick={onBack}>
          &#8592; Back to store
        </button>
        <button
          type="button"
          className="shelf-page__scan-corner-btn"
          aria-label="Scan shelf"
          onClick={() => {
            const opening = !scanOpen
            setScanOpen(opening)
            setCameraError('')
            setQrMessage('')
            setQrScanned(false)
            if (opening) startCamera()
            else stopCamera()
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h2v2h-2zM18 14h3M14 18v3M18 18h3v3h-3z" strokeLinecap="round" />
          </svg>
        </button>
        <p className="shelf-page__eyebrow">AISLE {shelfMeta.aisleNumber}</p>

        <button
          type="button"
          className="shelf-page__scan-corner-btn shelf-page__share-corner-btn"
          aria-label="Share shelf link"
          onClick={handleShareLink}
          title="Share shelf link"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="18" cy="5" r="2.5" />
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="19" r="2.5" />
            <path d="M8.3 11l7.4-4.1M8.3 13l7.4 4.1" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* ── Scan modal ── */}
      {scanOpen && (
        <div className="shelf-page__scan-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { stopCamera(); setScanOpen(false); } }}>
          <div className="shelf-page__scan-modal">
            <div className="shelf-page__scan-modal-header">
              <span className="shelf-page__scan-modal-title">Scan Shelf</span>
              <button
                type="button"
                className="shelf-page__scan-modal-close"
                onClick={() => { stopCamera(); setScanOpen(false); }}
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>
            {cameraError && <p className="shelf-page__error">{cameraError}</p>}
            {qrMessage && <p className="shelf-page__scan-status">{qrMessage}</p>}
            {isCameraActive && (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="shelf-page__scan-modal-video" />
                <canvas ref={canvasRef} className="shelf-page__scan-canvas" aria-hidden="true" />
              </>
            )}
            {!isQrLoading && isCameraActive && !qrScanned && (
              <div className="shelf-page__scan-actions">
                <button type="button" className="shelf-page__secondary-btn" onClick={() => { stopCamera(); startCamera() }}>
                  Retry camera
                </button>
              </div>
            )}
            {isQrLoading && (
              <div className="shelf-page__scan-actions">
                <button type="button" className="shelf-page__capture-btn" disabled>
                  Opening shelf...
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 3D Planogram Viewer ── */}
      <div className="shelf-page__viewer-wrap">
        {layout.id ? (
          <iframe
            className="shelf-page__viewer-iframe"
            src={`${PLANOGRAM_VIEWER_BASE_URL}/viewer?shelfId=${encodeURIComponent(layout.id)}${viewerHighlightQuery}`}
            title={`3D planogram view – ${layout.name || layout.id}`}
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <div className="shelf-page__viewer-fallback">
            <span>3D shelf preview unavailable</span>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="shelf-page__body shelf-page__body--elevated">
        {/* Selected product chips */}
        {selectedProducts.length > 0 && (
          <div className="shelf-page__chips">
            {selectedProducts.map((product) => {
              const id = product.id || product.name || product.product_name
              const label = product.name || product.product_name || id
              return (
                <span key={id} className="shelf-page__chip">
                  {label}
                  <button
                    type="button"
                    className="shelf-page__chip-remove"
                    onClick={() => removeSelected(product)}
                    aria-label={`Remove ${label}`}
                  >
                    &#x2715;
                  </button>
                </span>
              )
            })}
          </div>
        )}

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
              placeholder="Search products on this shelf..."
              value={searchTerm}
              onChange={(e) => {
                const value = e.target.value
                setSearchTerm(value)
                if (!value.trim()) {
                  setShowDropdown(false)
                  return
                }
                setShowDropdown(!isQuestionInput(value))
              }}
              onFocus={() => {
                if (searchTerm.trim() && !isQuestionInput(searchTerm) && dropdownResults.length > 0) {
                  setShowDropdown(true)
                }
              }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setShowDropdown(false)
                  handleAskAI()
                }
              }}
              autoComplete="off"
            />
            <button
              type="button"
              className={`shelf-page__mic-btn ${isListening ? 'is-listening' : ''}`}
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
              {isListening && <span className="shelf-page__mic-pulse" aria-hidden="true" />}
            </button>
            {showDropdown && dropdownResults.length > 0 && (
              <ul className="shelf-page__search-dropdown" role="listbox">
                <li className="shelf-page__search-dropdown-header">
                  <span className="shelf-page__search-dropdown-title">Results</span>
                  <button
                    type="button"
                    className="shelf-page__search-dropdown-close"
                    aria-label="Close dropdown"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowDropdown(false)}
                  >
                    &#x2715;
                  </button>
                </li>
                {dropdownResults.map((product, i) => {
                  const selected = selectedProducts.some((item) => (item.id || item.name || item.product_name) === (product.id || product.name || product.product_name))
                  return (
                    <li
                      key={product.id || i}
                      role="option"
                      aria-selected={selected}
                      className={`shelf-page__search-option${selected ? ' is-selected' : ''}`}
                      onMouseDown={() => handleSelectProduct(product)}
                    >
                      <span className="shelf-page__search-option-name">{product.name}</span>
                      {product.brand && <span className="shelf-page__search-option-brand">{product.brand}</span>}
                      {products.some((p) => (p.name || '').toLowerCase() === (product.name || '').toLowerCase()) && (
                        <span className="shelf-page__search-option-on-shelf">On shelf</span>
                      )}
                      {selected && <span className="shelf-page__search-option-check">&#10003;</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <button
            type="button"
            className="shelf-page__ask-btn"
            onClick={() => handleAskAI()}
            disabled={!searchTerm.trim()}
          >
            Ask AI
          </button>
        </div>
        {speechError && <p className="shelf-page__status shelf-page__status--voice">{speechError}</p>}


        {/* WhatsApp-style chat history */}
        <div className="shelf-page__chat-toolbar">
          <span className="shelf-page__chat-title">Chat history</span>
          <button
            type="button"
            className="shelf-page__chat-clear-btn"
            onClick={clearChatHistory}
            disabled={chatHistory.length === 0}
          >
            Clear chat
          </button>
        </div>
        <div className="shelf-page__chat-history" ref={chatHistoryRef}>
          {chatHistory.length === 0 && (
            <div className="shelf-page__chat-placeholder">AI response will appear here...</div>
          )}
          {chatHistory.map((msg, idx) => (
            <div
              key={idx}
              className={
                'shelf-page__chat-bubble ' +
                (msg.role === 'user' ? 'shelf-page__chat-bubble--user' : 'shelf-page__chat-bubble--ai')
              }
            >
              {(msg.text === 'Thinking...' || msg.text === 'Searching...') ? (
                <span className="shelf-page__chat-loading">
                  {msg.text}
                  <span className="shelf-page__chat-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              ) : (
                msg.text.split('\n').map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < msg.text.split('\n').length - 1 && <br />}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>

        {/* Products section */}
        {(() => {
          // Check if any chat products are off-shelf
          const offShelfChatProducts = chatProducts.filter(cp => {
            const cpNormalized = normalizeProductName(cp.name || cp.product_name)
            return !products.some(sp => normalizeProductName(sp.name) === cpNormalized)
          })
          const hasOffShelf = offShelfChatProducts.length > 0
          const shelfOnlyCount = products.length
          
          return (
            <>
              <h2 className="shelf-page__products-heading">
                {hasOffShelf
                  ? `The similar products are (${loading ? '…' : shelfOnlyCount})`
                  : `Products on this shelf (${loading ? '…' : displayedProducts.length})`
                }
              </h2>
              {/* {hasOffShelf && (
                <div className="shelf-page__off-shelf-intro">
                  <p>Below products from AI are shown:</p>
                </div>
              )} */}
            </>
          )
        })()}

        {loading && <p className="shelf-page__status">Loading shelf data…</p>}
        {error && <p className="shelf-page__error">{error}</p>}

        {!loading && !error && displayedProducts.length === 0 && (
          <p className="shelf-page__status">No products found{searchTerm ? ' for your search' : ' on this shelf'}.</p>
        )}

        <ul className="shelf-page__products" role="list">
          {displayedProducts.map((product, i) => {
            const key = product.id ?? i
            const source = product._source || 'shelf'
            const isOffShelf = source === 'chat' && !products.some(sp => normalizeProductName(sp.name) === normalizeProductName(product.name))
            const isAiResult = aiResultNameSet.has(normalizeProductName(product.name || product.product_name || product.ProductName || ''))
            return (
              <ProductCard
                key={key}
                product={product}
                shelfFolder={shelfMeta.shelfCode}
                expanded={expandedId === key}
                onToggle={() => toggleProduct(key, product)}
                selected={isProductSelected(product)}
                onSelectToggle={() => toggleSelectedProduct(product)}
                source={source}
                isOffShelf={isOffShelf}
                isAiResult={isAiResult}
              />
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default ShelfExperiencePage
