// AIAssistant.jsx
export function AIAssistant() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');

    const askAgent = async () => {
        const userMsg = { text: input, sender: 'user' };
        setMessages([...messages, userMsg]);
        
        const response = await sendAgentQuery(input);
        
        setMessages(prev => [...prev, { text: response.answer, sender: 'ai' }]);
        setInput('');
    };

    return (
        <div className="ai-chat-overlay">
            {/* Render chat history and input with mic button */}
        </div>
    );
}