// Auth session utility from App.jsx
function getStoredAuthSession() {
  if (typeof window === 'undefined') {
    return { authenticated: false, username: '' };
  }
  try {
    const raw = window.localStorage.getItem('shopilotAuthSession:v1');
    if (!raw) {
      return { authenticated: false, username: '' };
    }
    const parsed = JSON.parse(raw);
    return {
      authenticated: Boolean(parsed?.authenticated),
      username: String(parsed?.username || ''),
    };
  } catch {
    return { authenticated: false, username: '' };
  }
}

import { useState, useRef, useEffect } from 'react';

import { Link } from 'react-router-dom';
import '../../styles/layout.css';
import './styles/FoodChatPage.css';
import Button from '../ui/Button';
import { sendFoodChatQuery } from '../../services/api';


// (Removed duplicate useEffect import)
import { useNavigate } from 'react-router-dom';

const FoodChatPage = () => {
  const [messages, setMessages] = useState([]);
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    const auth = getStoredAuthSession();
    if (!auth.authenticated) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Microphone/Speech-to-text setup
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';
    recognitionRef.current.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => prev + transcript);
      setListening(false);
    };
    recognitionRef.current.onerror = () => setListening(false);
    recognitionRef.current.onend = () => setListening(false);
  }, []);

  const handleMic = async () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  };


  const handleSend = async (e) => {
    e && e.preventDefault();
    if (!input.trim()) return;
    const userMessage = { role: 'user', content: input };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setLoading(true);
    setInput('');
    try {
      const data = await sendFoodChatQuery(input, nextMessages);
      setMessages((msgs) => [...msgs, { role: 'assistant', content: data?.answer || '' }]);
    } catch (err) {
      setMessages((msgs) => [...msgs, { role: 'assistant', content: 'Sorry, something went wrong.' }]);
    }
    setLoading(false);
  };

  return (
    <div className="food-chat-fullscreen shelf-page" style={{ background: '#f4f4f1' }}>
      {/* Full-width header styled like shelf-page__header */}
      <header className="shelf-page__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem clamp(1rem, 2vw, 2.5rem) 1.5rem', background: 'linear-gradient(110deg, #02160f 0%, #0a3f2b 48%, #2d6937 100%)', color: '#f4f7f5', width: '100%', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 0, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <img src="https://brand.ust.com/etc.clientlibs/global/clientlibs/clientlib-base/resources/images/logo-main.svg" alt="UST Logo" className="food-chat-ust-logo" style={{ width: 34, height: 34, objectFit: 'contain', display: 'block' }} />
          </div>
          <span style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '0.01em', color: '#f4f7f5' }}>AI Food Assistant</span>
        </div>
        <div style={{ position: 'absolute', right: '2.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" className="shelf-page__back" style={{ background: '#d7dfd9', color: '#25302b', border: 0, fontSize: '1rem', fontWeight: 600, padding: '0.6rem 1.1rem' }}>Home</Button>
          </Link>
        </div>
      </header>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 24, width: '100%' }}>
        <div className={`food-chat-card shelf-page__chat-card${loading ? ' food-chat-card--loading' : ''}`} style={{
          background: '#fff',
          borderRadius: 18,
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
          margin: '2.5vh 0',
          width: 'min(98vw, 900px)',
          maxWidth: 900,
          height: '75vh',
          maxHeight: '90vh',
          minHeight: 400,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          border: '3px solid #21c97a',
          boxSizing: 'border-box',
          transition: 'box-shadow 0.3s, border-color 0.3s',
          padding: 0,
        }}>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '10px 18px 0 0', minHeight: 0, zIndex: 3 }}>
            <Button variant="ghost" className="shelf-page__chat-clear-btn" style={{ border: '1.5px solid #21c97a', background: '#fff', color: '#355548', fontSize: '1rem', fontWeight: 600, padding: '0.5rem 1.1rem', marginBottom: 0 }} onClick={() => setMessages([])} type="button">Clear Chat</Button>
          </div>
        {/* Change your message history div to look exactly like this */}
<div className="food-chat-messages shelf-page__chat-history" style={{
  background: '#f7f7f5',
  borderRadius: 12,
  border: '1px solid #c8d4cd',
  margin: '10px 16px 0 16px',
  flex: '1 1 0%',
  minHeight: 0,              // Crucial for flexbox scroll calculation
  width: 'auto',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  padding: '1.2rem',
  overflowY: 'auto',         // Enables the scroll bar when content height overflows
  height: 'auto',
  maxHeight: 'none',
}}>
  {/* NEW: This hidden div pushes messages down when short, but shrinks when long to allow scrolling */}
  <div style={{ marginTop: 'auto' }} />

  {messages.map((msg, idx) => (
    <div
      key={idx}
      className={`shelf-page__chat-history-row ${msg.role === 'user' ? 'shelf-page__chat-row--user' : 'shelf-page__chat-row--ai'}`}
      style={{
        display: 'flex',
        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
        marginBottom: 8
      }}
    >
      <div
        className={`shelf-page__chat-bubble ${msg.role === 'user' ? 'shelf-page__chat-bubble--user' : 'shelf-page__chat-bubble--ai'}`}
        style={{
          maxWidth: '80%',
          alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
          background: msg.role === 'user'
            ? 'linear-gradient(90deg, #d2f9d4 0%, #b6e7c9 100%)'
            : '#fff',
          color: '#1a2e24',
          borderBottomRightRadius: msg.role === 'user' ? 6 : 18,
          borderBottomLeftRadius: msg.role === 'user' ? 18 : 6,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
          padding: '0.7rem 1.1rem',
          fontSize: '0.97rem',
          lineHeight: 1.6,
          wordBreak: 'break-word',
          whiteSpace: 'pre-line',
        }}
      >
        <span
          dangerouslySetInnerHTML={{
            __html: (msg.content || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'),
          }}
        />
      </div>
    </div>
  ))}
  
  {loading && (
    <div className="shelf-page__chat-history-row shelf-page__chat-row--ai" style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
      <div className="shelf-page__chat-bubble shelf-page__chat-bubble--ai" style={{ background: '#fff', padding: '0.7rem 1.1rem', borderRadius: 18 }}>
        <span className="food-chat-typing">
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </span>
      </div>
    </div>
  )}
  <div ref={messagesEndRef} />
</div>
        <form className="food-chat-input-area" style={{
          borderTop: '1px solid #e6ece8',
          background: '#fff',
          width: '100%',
          margin: 0,
          padding: '12px 1.2rem',
          position: 'relative',
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 18,
          boxSizing: 'border-box',
          flexShrink: 0,
        }} onSubmit={handleSend}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about food, recipes, etc..."
            disabled={loading}
            style={{ flex: 1, padding: '10px 14px', border: '1px solid #c8d4cd', borderRadius: 8, fontSize: '1rem', outline: 'none', marginRight: 8 }}
          />
          <button
            type="button"
            className={`food-chat-mic-btn${listening ? ' listening' : ''}`}
            onClick={handleMic}
            aria-label={listening ? 'Stop listening' : 'Start voice input'}
            disabled={loading}
            style={{ marginRight: 8, background: '#ecf3ee', color: '#0a3f2b', border: '1.5px solid #0a3f2b', borderRadius: 8, fontSize: '1.3rem', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
          </button>
          <Button type="submit" variant="primary" style={{ background: '#0a3f2b', color: '#fff', borderRadius: 8, fontSize: '1rem', fontWeight: 600, height: 40, padding: '0 22px', boxShadow: '0 10px 24px #0a3f2b33', display: 'flex', alignItems: 'center', gap: 8 }} disabled={loading || !input.trim()}>
            {loading ? '...' : (<><span>Ask AI</span><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></>)}
          </Button>
        </form>
        </div>
        
      </div>
    </div>
  );
};

export default FoodChatPage;

