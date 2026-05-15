// Base URL for the Flask backend.
// Defaults to same-origin (empty string) so requests go to the current host via the Nginx /api proxy.
// Override with VITE_FLASK_API_BASE only when the API lives on a different origin (e.g. https://api.example.com).
const FLASK_BASE_URL = (import.meta.env.VITE_FLASK_API_BASE || '').replace(/\/$/, '');

export const fetchAllProductsFull = async () => {
    const response = await fetch(`${FLASK_BASE_URL}/api/products`);
    const res = await response.json();
    const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    return list;
};

export const fetchAllProducts = async () => {
    const response = await fetch(`${FLASK_BASE_URL}/api/products?fields=name`);
    const res = await response.json();
    // Extract only name (+ id as key) regardless of backend field naming
    const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
    const names = list.map((p) => ({
        id: p.id || p.UPC || p.upc || '',
        name:              p.Name             || p.name             || '',
        brand:             p.Brand            || p.brand            || '',
        category:          p.Category         || p.category         || '',
        description:       p.Description      || p.description      || '',
        nutritional_facts: p.Nutritional_Facts || p.nutritional_facts || '',
    })).filter((p) => p.name);
    return { status: 'success', data: names };
};

export const fetchDirectProductDetails = async (upc) => {
    const response = await fetch(`${FLASK_BASE_URL}/api/product-click/${upc}`);
    return response.json();
};

export const fetchProductById = async (id) => {
    const response = await fetch(`${FLASK_BASE_URL}/api/products/${encodeURIComponent(id)}`);
    return response.json();
};

export const sendAgentQuery = async (query) => {
    const response = await fetch(`${FLASK_BASE_URL}/api/agent-query`, {
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
    const response = await fetch(`${FLASK_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, messages: safeMessages })
    });
    return response.json();
};

export const getSpeechToken = async () => {
    const response = await fetch(`${FLASK_BASE_URL}/api/speech-to-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    return {
        ...data,
        key: data.token || data.key || '',
    };
};