const DEFAULT_PLANOGRAM_API_BASE = 'https://planogram.fcust.com'
const DEFAULT_STORE_SCAN_START_ID = 1
const DEFAULT_STORE_SCAN_MAX_ID = 1500
const DEFAULT_STORE_SCAN_BATCH_SIZE = 50
const DEFAULT_STORE_SCAN_MISS_STREAK_LIMIT = 15
const DEFAULT_STORE_REQUEST_TIMEOUT_MS = 10000
const DEFAULT_STORES_CACHE_TTL_MS = 60000
const DEFAULT_ENABLE_STORE_ID_SCAN = false
const STORES_CACHE_KEY = 'planogramStoresCache:v1'

let storesRequestInFlight = null

const trimValue = (value) => {
    if (typeof value !== 'string') {
        return ''
    }
    return value.trim()
}

const getApiBase = () => {
    const fromEnv = trimValue(import.meta.env.VITE_PLANOGRAM_API_BASE)
    return fromEnv || DEFAULT_PLANOGRAM_API_BASE
}

const parsePositiveInt = (rawValue, fallback) => {
    const parsed = Number.parseInt(rawValue, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback
    }
    return parsed
}

const parseBoolean = (rawValue, fallback) => {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return fallback
    }

    const normalized = String(rawValue).trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false
    }

    return fallback
}

const getStoreScanConfig = () => {
    const startId = parsePositiveInt(
        import.meta.env.VITE_PLANOGRAM_STORE_SCAN_START_ID,
        DEFAULT_STORE_SCAN_START_ID
    )
    const maxId = parsePositiveInt(
        import.meta.env.VITE_PLANOGRAM_STORE_SCAN_MAX_ID,
        DEFAULT_STORE_SCAN_MAX_ID
    )
    const batchSize = parsePositiveInt(
        import.meta.env.VITE_PLANOGRAM_STORE_SCAN_BATCH_SIZE,
        DEFAULT_STORE_SCAN_BATCH_SIZE
    )
    const missStreakLimit = parsePositiveInt(
        import.meta.env.VITE_PLANOGRAM_STORE_SCAN_MISS_STREAK_LIMIT,
        DEFAULT_STORE_SCAN_MISS_STREAK_LIMIT
    )
    const requestTimeoutMs = parsePositiveInt(
        import.meta.env.VITE_PLANOGRAM_STORE_REQUEST_TIMEOUT_MS,
        DEFAULT_STORE_REQUEST_TIMEOUT_MS
    )
    const cacheTtlMs = parsePositiveInt(
        import.meta.env.VITE_PLANOGRAM_STORES_CACHE_TTL_MS,
        DEFAULT_STORES_CACHE_TTL_MS
    )
    const enableIdScan = parseBoolean(
        import.meta.env.VITE_PLANOGRAM_ENABLE_STORE_ID_SCAN,
        DEFAULT_ENABLE_STORE_ID_SCAN
    )

    return {
        startId: Math.min(startId, maxId),
        maxId,
        batchSize,
        missStreakLimit,
        requestTimeoutMs,
        cacheTtlMs,
        enableIdScan,
    }
}

const getIdentityFromEnv = () => {
    const userId = trimValue(import.meta.env.VITE_PLANOGRAM_USER_ID)
    const username = trimValue(import.meta.env.VITE_PLANOGRAM_USERNAME)

    if (userId) {
        return { key: 'userId', value: userId }
    }

    if (username) {
        return { key: 'username', value: username }
    }

    return null
}

const getUsernameFromEnv = () => {
    const username = trimValue(import.meta.env.VITE_PLANOGRAM_USERNAME)
    return username || ''
}

const getIdentityFromUrl = () => {
    if (typeof window === 'undefined') {
        return null
    }

    const params = new URLSearchParams(window.location.search)
    const userId = trimValue(params.get('planogramUserId'))
    const username = trimValue(params.get('planogramUsername'))

    if (userId) {
        return { key: 'userId', value: userId }
    }

    if (username) {
        return { key: 'username', value: username }
    }

    return null
}

const getUsernameFromUrl = () => {
    if (typeof window === 'undefined') {
        return ''
    }

    const params = new URLSearchParams(window.location.search)
    return trimValue(params.get('planogramUsername'))
}

const getIdentityFromBrowserStorage = () => {
    if (typeof window === 'undefined') {
        return null
    }

    const storageCandidates = [window.localStorage, window.sessionStorage]

    const readDirectValue = (storage, key) => {
        try {
            return trimValue(storage.getItem(key))
        } catch {
            return ''
        }
    }

    const readJsonValue = (storage, key, field) => {
        const raw = readDirectValue(storage, key)
        if (!raw) {
            return ''
        }

        try {
            const parsed = JSON.parse(raw)
            return trimValue(parsed?.[field])
        } catch {
            return ''
        }
    }

    for (const storage of storageCandidates) {
        if (!storage) {
            continue
        }

        const userId =
            readDirectValue(storage, 'userId') ||
            readDirectValue(storage, 'userid') ||
            readJsonValue(storage, 'user', 'id')
        if (userId) {
            return { key: 'userId', value: userId }
        }

        const username =
            readDirectValue(storage, 'username') ||
            readJsonValue(storage, 'user', 'username')
        if (username) {
            return { key: 'username', value: username }
        }
    }

    return null
}

const getUsernameFromBrowserStorage = () => {
    if (typeof window === 'undefined') {
        return ''
    }

    const storageCandidates = [window.localStorage, window.sessionStorage]

    const readDirectValue = (storage, key) => {
        try {
            return trimValue(storage.getItem(key))
        } catch {
            return ''
        }
    }

    const readJsonValue = (storage, key, field) => {
        const raw = readDirectValue(storage, key)
        if (!raw) {
            return ''
        }

        try {
            const parsed = JSON.parse(raw)
            return trimValue(parsed?.[field])
        } catch {
            return ''
        }
    }

    for (const storage of storageCandidates) {
        if (!storage) {
            continue
        }

        const username =
            readDirectValue(storage, 'username') ||
            readJsonValue(storage, 'user', 'username')

        if (username) {
            return username
        }
    }

    return ''
}

const resolveKnownUsernames = () => {
    const candidates = [getUsernameFromEnv(), getUsernameFromBrowserStorage(), getUsernameFromUrl()]
    return dedupeStrings(candidates)
}

const resolveKnownUserIds = () => {
    const candidates = []

    const fromEnv = trimValue(import.meta.env.VITE_PLANOGRAM_USER_ID)
    if (fromEnv) {
        candidates.push(fromEnv)
    }

    if (typeof window !== 'undefined') {
        const storageCandidates = [window.localStorage, window.sessionStorage]
        for (const storage of storageCandidates) {
            if (!storage) {
                continue
            }

            try {
                const direct = trimValue(storage.getItem('userId') || storage.getItem('userid'))
                if (direct) {
                    candidates.push(direct)
                }

                const rawUser = storage.getItem('user')
                if (rawUser) {
                    const parsedUser = JSON.parse(rawUser)
                    const parsedId = trimValue(String(parsedUser?.id ?? ''))
                    if (parsedId) {
                        candidates.push(parsedId)
                    }
                }
            } catch {
                // Ignore malformed storage values.
            }
        }

        try {
            const params = new URLSearchParams(window.location.search)
            const fromUrl = trimValue(params.get('planogramUserId'))
            if (fromUrl) {
                candidates.push(fromUrl)
            }
        } catch {
            // Ignore URL parsing issues.
        }
    }

    return dedupeStrings(candidates)
}

const fetchUsernameByUserId = async (userId) => {
    if (!userId) {
        return ''
    }

    try {
        const response = await fetch(
            `${getApiBase()}/api/users/${userId}`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
            }
        )

        if (!response.ok) {
            return ''
        }

        const user = await response.json()

        return trimValue(user?.username ?? '')
    } catch (error) {
        console.error('Failed to fetch username:', error)
        return ''
    }
}

const resolveLayoutOwnerCandidates = (store) => {
    const candidates = []

    // 1. Store owner user_id (MOST IMPORTANT)
    const storeUserId = trimValue(String(store?.user_id ?? ''))
    if (storeUserId) {
        candidates.push(storeUserId)
    }

    // 2. Store owner username
    const storeUsername = trimValue(store?.username ?? '')
    if (storeUsername) {
        candidates.push(storeUsername)
    }

    // 3. Current known usernames
    candidates.push(...resolveKnownUsernames())

    // 4. Current known user ids
    candidates.push(...resolveKnownUserIds())

    return dedupeStrings(candidates)
}

const resolveIdentity = (identityOverride) => {
    if (identityOverride && identityOverride.key && identityOverride.value) {
        return identityOverride
    }

    return getIdentityFromEnv() || getIdentityFromBrowserStorage() || getIdentityFromUrl()
}

const toArray = (value) => (Array.isArray(value) ? value : [])

const parseJsonValue = (value) => {
    if (typeof value !== 'string') {
        return value
    }

    try {
        return JSON.parse(value)
    } catch {
        return value
    }
}

const dedupeStrings = (items) => {
    const seen = new Set()
    const output = []

    for (const item of items) {
        const value = trimValue(item)
        if (!value || seen.has(value)) {
            continue
        }
        seen.add(value)
        output.push(value)
    }

    return output
}

const mapSavedLayoutForUi = (layout, index) => {
    const rawName = trimValue(layout?.name)
    return {
        id: layout?.id ?? `layout-${index + 1}`,
        name: rawName || `Layout ${index + 1}`,
        status: trimValue(layout?.status) || 'Review',
        createdAt: layout?.created_at || null,
        storeId: layout?.store_id ?? null,
        previewImage: layout?.preview_image || null,
    }
}

const extractShelfNames = (layoutData) => {
    const parsedLayout = parseJsonValue(layoutData)

    if (!parsedLayout || typeof parsedLayout !== 'object') {
        return []
    }

    const layoutPlan = Array.isArray(parsedLayout.layout_plan) ? parsedLayout.layout_plan : []
    const names = layoutPlan
        .map((shelf) => shelf?.shelf_name)
        .filter((name) => typeof name === 'string' && name.trim().length > 0)

    return dedupeStrings(names)
}

const mapStoreForUi = (store, index) => {
    const position = String(index + 1).padStart(2, '0')
    const shelves = extractShelfNames(store?.layout_data)

    return {
        ...store,
        id: store?.id ?? `store-${position}`,
        number: position,
        name: trimValue(store?.name) || `Store ${position}`,
        address: trimValue(store?.address) || 'Address unavailable',
        badge: store?.is_active ? 'Active' : 'Open',
        shelves,
    }
}

const buildUrl = (path, query) => {
    const baseUrl = new URL(getApiBase())
    const url = new URL(path, `${baseUrl.origin}/`)

    if (query && typeof query === 'object') {
        for (const [key, value] of Object.entries(query)) {
            if (value === null || value === undefined || value === '') {
                continue
            }
            url.searchParams.set(key, String(value))
        }
    }

    return url.toString()
}

const isAbortError = (error) => error?.name === 'AbortError'

const getErrorStatusCode = (error) => {
    const message = String(error?.message || '')
    const match = message.match(/(\d{3})/)
    if (!match) {
        return null
    }
    const status = Number.parseInt(match[1], 10)
    return Number.isFinite(status) ? status : null
}

const fetchJson = async (path, query) => {
    const response = await fetch(buildUrl(path, query), {
        method: 'GET',
        headers: {
            Accept: 'application/json',
        },
    })

    if (!response.ok) {
        throw new Error(`Planogram API request failed: ${response.status}`)
    }

    return response.json()
}

const fetchJsonWithTimeout = async (path, query, timeoutMs) => {
    if (typeof AbortController === 'undefined') {
        return fetchJson(path, query)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(buildUrl(path, query), {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            signal: controller.signal,
        })

        if (!response.ok) {
            throw new Error(`Planogram API request failed: ${response.status}`)
        }

        return response.json()
    } finally {
        clearTimeout(timeoutId)
    }
}


const fetchStoreByIdRaw = async (storeId) => {
    const { requestTimeoutMs } = getStoreScanConfig()
    if (typeof AbortController === 'undefined') {
        const response = await fetch(buildUrl(`/api/stores/${storeId}`, { includePreview: 'false' }), {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
        })

        if (response.status === 404) {
            return null
        }

        if (!response.ok) {
            throw new Error(`Planogram store details failed: ${response.status}`)
        }

        return response.json()
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)

    let response
    try {
        response = await fetch(buildUrl(`/api/stores/${storeId}`, { includePreview: 'false' }), {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            signal: controller.signal,
        })
    } finally {
        clearTimeout(timeoutId)
    }

    if (response.status === 404) {
        return null
    }

    if (!response.ok) {
        throw new Error(`Planogram store details failed: ${response.status}`)
    }

    return response.json()
}

const readStoresCache = () => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return null
    }

    try {
        const raw = window.localStorage.getItem(STORES_CACHE_KEY)
        if (!raw) {
            return null
        }

        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') {
            return null
        }

        if (!Array.isArray(parsed.stores) || typeof parsed.timestamp !== 'number') {
            return null
        }

        return parsed
    } catch {
        return null
    }
}

const writeStoresCache = (stores) => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return
    }

    try {
        window.localStorage.setItem(
            STORES_CACHE_KEY,
            JSON.stringify({
                timestamp: Date.now(),
                stores,
            })
        )
    } catch {
        // Ignore cache write failures (private mode, quota, etc.).
    }
}

const getFreshCachedStores = () => {
    const { cacheTtlMs } = getStoreScanConfig()
    const cached = readStoresCache()
    if (!cached) {
        return null
    }

    if ((Date.now() - cached.timestamp) > cacheTtlMs) {
        return null
    }

    return cached.stores
}

const discoverAllStoresByIdScan = async () => {
    const { startId, maxId, batchSize, missStreakLimit } = getStoreScanConfig()
    const discoveredStores = []
    const dedupeById = new Set()
    let missStreak = 0

    for (let cursor = startId; cursor <= maxId; cursor += batchSize) {
        const batchIds = []
        const batchUpperBound = Math.min(cursor + batchSize - 1, maxId)
        for (let id = cursor; id <= batchUpperBound; id += 1) {
            batchIds.push(id)
        }

        const batchResults = await Promise.all(
            batchIds.map(async (id) => {
                try {
                    const store = await fetchStoreByIdRaw(id)
                    return { id, store, errored: false }
                } catch {
                    return { id, store: null, errored: true }
                }
            })
        )

        for (const result of batchResults) {
            if (result.errored || !result.store) {
                missStreak += 1
                continue
            }

            missStreak = 0
            const storeId = result.store?.id ?? result.id
            if (dedupeById.has(storeId)) {
                continue
            }

            dedupeById.add(storeId)
            discoveredStores.push(result.store)
        }

        // Do not stop before the first discovery; some datasets start at higher IDs.
        if (missStreak >= missStreakLimit && discoveredStores.length > 0) {
            break
        }
    }

    discoveredStores.sort((a, b) => {
        const left = Number(a?.id) || 0
        const right = Number(b?.id) || 0
        return left - right
    })

    return discoveredStores
}

const fetchPlanogramStoresInternal = async ({ identity } = {}) => {
    // 1. Return from cache if still fresh
    const cachedStores = getFreshCachedStores()
    if (cachedStores && cachedStores.length > 0) {
        return {
            stores: toArray(cachedStores).map(mapStoreForUi),
            hasIdentity: true,
        }
    }

    const { requestTimeoutMs } = getStoreScanConfig()
    const resolvedIdentity = resolveIdentity(identity)

    // 2. Try GET /api/stores with identity params (avoids 400 from unauthenticated call)
    if (resolvedIdentity) {
        try {
            const stores = await fetchJsonWithTimeout('/api/stores', {
                [resolvedIdentity.key]: resolvedIdentity.value,
            }, requestTimeoutMs)
            const storeList = toArray(stores)
            if (storeList.length > 0) {
                writeStoresCache(storeList)
                return {
                    stores: storeList.map(mapStoreForUi),
                    hasIdentity: true,
                }
            }
        } catch {
            // Fall through
        }
    }

    // 3. Try bare GET /api/stores (works if backend allows unauthenticated listing)
    let listRequestStatus = null
    try {
        const allStores = await fetchJsonWithTimeout('/api/stores', {}, requestTimeoutMs)
        const storeList = toArray(allStores)
        if (storeList.length > 0) {
            writeStoresCache(storeList)
            return {
                stores: storeList.map(mapStoreForUi),
                hasIdentity: true,
            }
        }
    } catch (error) {
        listRequestStatus = getErrorStatusCode(error)
        // On this backend, /api/stores may return 400 without identity.
        // Fall through so ID-scan fallback can still discover stores.
        if (listRequestStatus && listRequestStatus >= 500) {
            // Keep same fallback path for server errors.
        }
    }

    const { enableIdScan } = getStoreScanConfig()
    const shouldAttemptIdScan =
        enableIdScan &&
        // If stores listing is rejected with 400 and we have no identity, avoid noisy probing.
        !(listRequestStatus === 400 && !resolvedIdentity)

    if (!shouldAttemptIdScan) {
        return {
            stores: [],
            hasIdentity: Boolean(resolvedIdentity),
        }
    }

    // 4. Last resort: ID scan — only runs when enabled and both REST calls above fail entirely
    const discoveredStores = await discoverAllStoresByIdScan()
    if (discoveredStores.length > 0) {
        writeStoresCache(discoveredStores)
        return {
            stores: toArray(discoveredStores).map(mapStoreForUi),
            hasIdentity: true,
        }
    }

    return {
        stores: [],
        hasIdentity: Boolean(resolvedIdentity),
    }
}

export const fetchPlanogramStores = async ({ identity } = {}) => {
    if (storesRequestInFlight) {
        return storesRequestInFlight
    }

    storesRequestInFlight = fetchPlanogramStoresInternal({ identity })
        .finally(() => {
            storesRequestInFlight = null
        })

    return storesRequestInFlight
}

export const fetchPlanogramStoreById = async (storeId) => {
    const store = await fetchJson(`/api/stores/${storeId}`, {
        includePreview: 'false',
    })

    const { requestTimeoutMs } = getStoreScanConfig()
    const layoutsById = new Map()

    const storeOwnerUserId = store?.user_id
    const storeOwnerUsername = await fetchUsernameByUserId(storeOwnerUserId)

    console.log('STORE OWNER USER ID:', storeOwnerUserId)
    console.log('STORE OWNER USERNAME:', storeOwnerUsername)

    if (storeOwnerUsername) {
        try {
            const layouts = await fetchJsonWithTimeout(
                '/api/saved-layouts',
                {
                    username: storeOwnerUsername,
                    store_id: storeId,
                },
                requestTimeoutMs
            )

            for (const layout of toArray(layouts)) {
                const key = layout?.id ?? `${storeOwnerUsername}-${layout?.name || ''}`

                if (!layoutsById.has(key)) {
                    layoutsById.set(key, layout)
                }
            }
        } catch (error) {
            if (isAbortError(error)) {
                console.warn('LAYOUT FETCH TIMED OUT FOR STORE:', storeId, '— retrying with extended timeout')
                // Retry once with 2x timeout for slow networks/backends
                try {
                    const layoutsRetry = await fetchJsonWithTimeout(
                        '/api/saved-layouts',
                        {
                            username: storeOwnerUsername,
                            store_id: storeId,
                        },
                        requestTimeoutMs * 2
                    )
                    for (const layout of toArray(layoutsRetry)) {
                        const key = layout?.id ?? `${storeOwnerUsername}-${layout?.name || ''}`
                        if (!layoutsById.has(key)) {
                            layoutsById.set(key, layout)
                        }
                    }
                } catch (retryError) {
                    console.warn('LAYOUT RETRY ALSO TIMED OUT FOR STORE:', storeId)
                }
            } else {
                console.error('FAILED TO LOAD LAYOUTS:', error)
            }
        }
    }

    console.log('STORE DATA:', store)

    const layouts = Array.from(layoutsById.values())
        .map(mapSavedLayoutForUi)
        .sort((a, b) => {
            const left = String(a.name).toLowerCase()
            const right = String(b.name).toLowerCase()
            if (left < right) {
                return -1
            }
            if (left > right) {
                return 1
            }
            return 0
        })

    const mapped = mapStoreForUi(store, 0)
    return {
        ...mapped,
        shelves: extractShelfNames(store?.layout_data),
        layouts,
    }
}

export const getPlanogramApiBase = () => getApiBase()

export const fetchLayoutById = async (layoutId) => {
    const layout = await fetchJson(`/api/saved-layouts/${layoutId}`)
    return layout
}
 
