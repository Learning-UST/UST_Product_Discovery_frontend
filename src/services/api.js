// Replace your old API base with the Flask URL
const FLASK_BASE_URL = 'http://127.0.0.1:5000';

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
    const response = await fetch(`${FLASK_BASE_URL}/api/product/direct/${upc}`);
    return response.json();
};

export const fetchProductById = async (id) => {
    const response = await fetch(`${FLASK_BASE_URL}/api/products/${encodeURIComponent(id)}`);
    return response.json();
};

export const sendAgentQuery = async (query) => {
    const response = await fetch(`${FLASK_BASE_URL}/agent-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    return response.json();
};

export const sendChatQuery = async (query) => {
    const response = await fetch(`${FLASK_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    return response.json();
};

export const getSpeechToken = async () => {
    const response = await fetch(`${FLASK_BASE_URL}/get-speech-token`);
    return response.json();
};