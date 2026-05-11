// Replace your old API base with the Flask URL
const FLASK_BASE_URL = 'http://127.0.0.1:5000';

export const fetchDirectProductDetails = async (upc) => {
    const response = await fetch(`${FLASK_BASE_URL}/api/product/direct/${upc}`);
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

export const getSpeechToken = async () => {
    const response = await fetch(`${FLASK_BASE_URL}/get-speech-token`);
    return response.json();
};