import { useState, useRef, useEffect } from 'react';
import styles from './AIAssistant.module.css';

const GREETING = { role: 'assistant', content: 'How may I help you?' };

export function AIAssistant() {
  const [open, setOpen]       = useState(false);
  const [prompt, setPrompt]   = useState('');
  const [messages, setMessages] = useState([GREETING]);
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef(null);
  const textareaRef           = useRef(null);

  useEffect(() => {
    if (open && textareaRef.current) textareaRef.current.focus();
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function handleSend() {
    if (!prompt.trim() || loading) return;

    const userMsg = { role: 'user', content: prompt.trim() };
    setMessages(prev => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:8000/api/ai/query', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id':    localStorage.getItem('user_id') || '',
        },
        body: JSON.stringify({ prompt: userMsg.content }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Make sure the backend is running.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      <button className={styles.fab} onClick={() => setOpen(o => !o)} title="AI Assistant">
        🤖
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <span className={styles.title}>AI Assistant</span>
            <button className={styles.close} onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className={styles.chat}>
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === 'user' ? styles.userBubble : styles.aiBubble}>
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className={styles.aiBubble}>
                <span className={styles.thinking}>
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                  <span className={styles.dot} />
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className={styles.inputRow}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              placeholder="Ask anything about your posts…"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <button
              className={styles.send}
              onClick={handleSend}
              disabled={loading || !prompt.trim()}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
