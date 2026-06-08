// Base URL for the Flask backend.
// Defaults to same-origin (empty string) so requests go to the current host via the Nginx /api proxy.
// Override with VITE_FLASK_API_BASE only when the API lives on a different origin (e.g. https://api.example.com).
const FLASK_BASE_URL = (import.meta.env.VITE_FLASK_API_BASE || '').replace(/\/$/, '');
const RUNTIME_PREFS_STORAGE_KEY = 'shopilotRuntimePrefs:v1';
const CURRENCY_HEADER_SENT_KEY = 'shopilotCurrencyHeaderSent:v1';
const CLOUD_HEADER_SENT_KEY = 'shopilotCloudHeaderSent:v1';

const DEFAULT_RUNTIME_PREFS = {
    currency: 'USD',
    cloudProvider: 'AZURE',
};

// Food chat endpoint
export const sendFoodChatQuery = async (query, messages) => {
    const safeMessages = Array.isArray(messages) ? messages : [];
    const response = await runtimeFetch(`${FLASK_BASE_URL}/api/chat-food`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, messages: safeMessages })
    });
    return response.json();
};
const normalizeCurrency = (value) => {
    const normalized = String(value || '').toUpperCase();
    return normalized === 'INR' ? 'INR' : 'USD';
};

const normalizeCloudProvider = (value) => {
    const normalized = String(value || '').toUpperCase();
    return normalized === 'AZURE' ? 'AZURE' : 'AWS';
};

const sanitizeRuntimePrefs = (prefs = {}) => ({
    currency: normalizeCurrency(prefs.currency),
    cloudProvider: normalizeCloudProvider(prefs.cloudProvider),
});

export const getRuntimePreferences = () => {
    if (typeof window === 'undefined') {
        return { ...DEFAULT_RUNTIME_PREFS };
    }

    try {
        const raw = window.localStorage.getItem(RUNTIME_PREFS_STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_RUNTIME_PREFS };
        }

        const parsed = JSON.parse(raw);
        return sanitizeRuntimePrefs({
            currency: parsed?.currency ?? DEFAULT_RUNTIME_PREFS.currency,
            cloudProvider: parsed?.cloudProvider ?? DEFAULT_RUNTIME_PREFS.cloudProvider,
        });
    } catch {
        return { ...DEFAULT_RUNTIME_PREFS };
    }
};

export const setRuntimePreferences = (nextPrefs = {}) => {
    const previous = getRuntimePreferences();
    const merged = sanitizeRuntimePrefs({
        ...previous,
        ...nextPrefs,
    });

    if (typeof window !== 'undefined') {
        try {
            window.localStorage.setItem(RUNTIME_PREFS_STORAGE_KEY, JSON.stringify(merged));

            // If currency changes, allow sending currency header once again.
            if (previous.currency !== merged.currency) {
                window.sessionStorage.removeItem(CURRENCY_HEADER_SENT_KEY);
            }

            // If cloud provider changes, allow sending cloud header once again.
            if (previous.cloudProvider !== merged.cloudProvider) {
                window.sessionStorage.removeItem(CLOUD_HEADER_SENT_KEY);
            }
        } catch {
            // Ignore storage write errors and continue with in-memory return value.
        }
    }

    return merged;
};

const shouldSendCurrencyHeader = () => {
    if (typeof window === 'undefined') {
        return true;
    }

    try {
        return window.sessionStorage.getItem(CURRENCY_HEADER_SENT_KEY) !== '1';
    } catch {
        return true;
    }
};

const markCurrencyHeaderSent = () => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.sessionStorage.setItem(CURRENCY_HEADER_SENT_KEY, '1');
    } catch {
        // Ignore storage write errors.
    }
};

const buildRuntimeHeaders = () => {
    const prefs = getRuntimePreferences();
    const headers = {};

    if (shouldSendCurrencyHeader()) {
        headers['X-Currency-Mode'] = prefs.currency;
    }

    if (shouldSendCloudHeader()) {
        headers['X-Cloud-Provider'] = prefs.cloudProvider;
    }

    return headers;
};

const withRuntimeHeaders = (headers = {}, includeJsonContentType = false) => {
    const runtimeHeaders = buildRuntimeHeaders();
    return {
        ...(includeJsonContentType ? { 'Content-Type': 'application/json' } : {}),
        ...runtimeHeaders,
        ...headers,
    };
};

const runtimeFetch = (url, options = {}) => {
    const shouldMarkCurrency = shouldSendCurrencyHeader();
    const shouldMarkCloud = shouldSendCloudHeader();
    const mergedOptions = {
        ...options,
        headers: withRuntimeHeaders(options.headers || {}, false),
    };

    return fetch(url, mergedOptions).then((response) => {
        if (shouldMarkCurrency && response.ok) {
            markCurrencyHeaderSent();
        }
        if (shouldMarkCloud && response.ok) {
            markCloudHeaderSent();
        }
        return response;
    });
};

export const fetchAllProductsFull = async () => {
    const response = await runtimeFetch(`${FLASK_BASE_URL}/api/products`);
    const res = await response.json();
    const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    return list;
};

export const fetchAllProducts = async () => {
    const response = await runtimeFetch(`${FLASK_BASE_URL}/api/products`);
    const res = await response.json();
    // Normalize key product attributes for search + detail display.
    const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    const names = list.map((p) => ({
        id: p.id || p.UPC || p.upc || '',
        upc: p.UPC || p.upc || p.id || '',
        name:              p.Name             || p.name             || '',
        brand:             p.Brand            || p.brand            || '',
        category:          p.Category         || p.category         || '',
        description:       p.Description      || p.description      || '',
        nutritional_facts: p.Nutritional_Facts || p.nutritional_facts || '',
        price: p.final_price ?? p.Final_Price ?? p.discounted_price ?? p.discountedPrice ?? p.US_Price ?? p.us_price ?? p.Price ?? p.price ?? null,
        final_price: p.final_price ?? p.Final_Price ?? null,
        us_price: p.US_Price ?? p.us_price ?? null,
    })).filter((p) => p.name);
    return { status: 'success', data: names };
};

export const fetchDirectProductDetails = async (upc) => {
    const encodedUpc = encodeURIComponent(String(upc || ''));

    // Prefer the enriched direct endpoint for full details (metadata + inventory + promo/final price).
    let response = await runtimeFetch(`${FLASK_BASE_URL}/api/product/direct/${encodedUpc}`);
    if (response.ok) {
        return response.json();
    }

    // Fallback to legacy click endpoint if direct endpoint is unavailable.
    response = await runtimeFetch(`${FLASK_BASE_URL}/api/product-click/${encodedUpc}`);
    return response.json();
};

export const fetchProductById = async (id) => {
    const encodedId = encodeURIComponent(String(id || ''));

    // Name lookup endpoint for off-shelf AI results.
    let response = await runtimeFetch(`${FLASK_BASE_URL}/api/product/name/${encodedId}`);
    if (response.ok) {
        return response.json();
    }

    // Fallback for environments exposing a generic products by id route.
    response = await runtimeFetch(`${FLASK_BASE_URL}/api/products/${encodedId}`);
    return response.json();
};

export const sendAgentQuery = async (query) => {
    const response = await runtimeFetch(`${FLASK_BASE_URL}/api/agent-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    return response.json();
};

// Accepts:
// query: latest user prompt string
// messages: [{role: 'user'|'assistant'|'system', content: string}, ...]
export const sendChatQuery = async (query, messages) => {
    const safeMessages = Array.isArray(messages) ? messages : [];
    const response = await runtimeFetch(`${FLASK_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, messages: safeMessages })
    });
    return response.json();
};

export const setAgentProvider = async (cloudProvider) => {
    const normalizedProvider = normalizeCloudProvider(cloudProvider);
    const response = await runtimeFetch(`${FLASK_BASE_URL}/api/set-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloud_provider: normalizedProvider.toLowerCase() }),
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        // Response may be empty in some backend deployments.
    }

    if (!response.ok) {
        const errorMessage = payload?.error || payload?.message || 'Failed to update agent provider';
        throw new Error(errorMessage);
    }

    return payload || {
        status: 'success',
        cloud_provider: normalizedProvider.toLowerCase(),
    };
};

export const getCloudProviderStatus = async () => {
    const response = await runtimeFetch(`${FLASK_BASE_URL}/api/cloud-provider`);

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok) {
        const errorMessage = payload?.error || payload?.message || 'Failed to fetch cloud provider status';
        throw new Error(errorMessage);
    }

    return payload || {
        status: 'ok',
        cloud_provider: 'aws',
        supported_providers: ['azure', 'aws'],
    };
};

export const getSpeechToken = async () => {
    const response = await runtimeFetch(`${FLASK_BASE_URL}/api/speech-to-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    return {
        ...data,
        key: data.token || data.key || '',
    };
};

const shouldSendCloudHeader = () => {
    if (typeof window === 'undefined') {
        return true;
    }

    try {
        return window.sessionStorage.getItem(CLOUD_HEADER_SENT_KEY) !== '1';
    } catch {
        return true;
    }
};

const markCloudHeaderSent = () => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.sessionStorage.setItem(CLOUD_HEADER_SENT_KEY, '1');
    } catch {
        // Ignore storage write errors.
    }
};