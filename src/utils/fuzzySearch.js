// Normalize: lowercase, strip punctuation/symbols, collapse whitespace
const normalize = (s) =>
  (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()

// Levenshtein edit distance between two strings
const levenshtein = (a, b) => {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = []
  for (let i = 0; i <= m; i++) {
    dp[i] = [i]
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        i === 0
          ? j
          : a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// Score 0–1 of how well needle matches haystack (both already normalized)
const scoreNormalized = (needle, haystack) => {
  if (!needle || !haystack) return 0
  // Exact substring match (highest confidence)
  if (haystack.includes(needle)) return 1.0
  if (needle.includes(haystack)) return 0.95

  // Token-level matching — handles word order, extra/missing spaces
  const nTokens = needle.split(' ').filter(Boolean)
  const hTokens = haystack.split(' ').filter(Boolean)

  // Each needle token must be close to at least one haystack token
  const tokenMatchCount = nTokens.filter((nt) =>
    hTokens.some(
      (ht) =>
        ht.includes(nt) ||
        nt.includes(ht) ||
        levenshtein(nt, ht) <= Math.max(1, Math.floor(Math.max(nt.length, ht.length) / 5))
    )
  ).length
  const tokenScore = tokenMatchCount / nTokens.length
  if (tokenScore >= 0.8) return 0.75 + 0.2 * tokenScore

  // Full-string edit distance as fallback
  const dist = levenshtein(needle, haystack)
  const maxLen = Math.max(needle.length, haystack.length)
  const editScore = 1 - dist / maxLen

  return Math.max(tokenScore * 0.7, editScore * 0.8)
}

/**
 * fuzzyFilter — returns products sorted by relevance; drops results below threshold.
 *
 * Handles:
 *  - Trailing/leading punctuation  ("Cup Noodles." → matches "Cup Noodles")
 *  - Extra / missing spaces        ("CupNoodles"   → matches "Cup Noodles")
 *  - Minor spelling mistakes       ("Noddles"      → matches "Noodles")
 *
 * @param {Array}  products   Array of product objects
 * @param {string} term       Raw search term (from input or voice)
 * @param {number} threshold  Minimum score to include (default 0.3)
 */
export const fuzzyFilter = (products, term, threshold = 0.3) => {
  const needle = normalize(term)
  if (!needle) return []

  return products
    .map((p) => {
      const name     = normalize(p.Name     || p.name     || p.product_name || '')
      const brand    = normalize(p.Brand    || p.brand    || '')
      const category = normalize(p.Category || p.category || '')
      const s = Math.max(
        scoreNormalized(needle, name),
        scoreNormalized(needle, brand)    * 0.85,
        scoreNormalized(needle, category) * 0.65
      )
      return { product: p, score: s }
    })
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product)
}
