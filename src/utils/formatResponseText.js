const toTitleCase = (value) => {
  return String(value || '').replace(/\b([a-z])([a-z']*)/g, (_, first, rest) => {
    return `${first.toUpperCase()}${rest.toLowerCase()}`
  })
}

// Preserve sentence text and only normalize lowercase bold segments, e.g. **disano oats** -> **Disano Oats**
export const normalizeResponseProductNameCasing = (text) => {
  return String(text || '').replace(/\*\*([^*]+)\*\*/g, (fullMatch, boldContent) => {
    const clean = String(boldContent || '').trim()
    if (!clean) {
      return fullMatch
    }

    const hasLetters = /[a-z]/i.test(clean)
    const isLowercase = clean === clean.toLowerCase()
    if (!hasLetters || !isLowercase) {
      return `**${clean}**`
    }

    return `**${toTitleCase(clean)}**`
  })
}
