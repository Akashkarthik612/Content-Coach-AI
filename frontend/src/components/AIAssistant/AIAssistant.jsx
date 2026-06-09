import { useState, useRef, useEffect } from 'react';
import styles from './AIAssistant.module.css';
import { queryAI, resumeAI } from '../../api/ai';

const GREETING = { role: 'assistant', content: 'How may I help you?' };

export function AIAssistant() {
  const [open, setOpen]             = useState(false);
  const [prompt, setPrompt]         = useState('');
  const [messages, setMessages]     = useState([GREETING]);
  const [loading, setLoading]       = useState(false);
  const [threadId, setThreadId]     = useState(null);
  const [editMode, setEditMode]     = useState(false);
  const [editContent, setEditContent] = useState('');
  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);

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
      const data = await queryAI(userMsg.content);
      if (data.status === 'awaiting_approval') {
        setThreadId(data.thread_id);
        setMessages(prev => [...prev, { role: 'draft', content: data.draft }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Make sure the backend is running.' }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleResume(action) {
    setLoading(true);
    setEditMode(false);
    try {
      const content = action === 'edited' ? editContent : '';
      const data = await resumeAI(threadId, action, content);
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
      setThreadId(null);
      setEditContent('');
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong.' }]);
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

  function renderMessage(msg, i) {
    if (msg.role === 'draft') {
      return (
        <div key={i} className={styles.aiBubble} style={{ padding: 0, overflow: 'hidden', maxWidth: '92%' }}>
          <div style={{ padding: '8px 12px', background: '#EEF2FF', borderBottom: '1px solid #E2E8F0', fontSize: 12, fontWeight: 600, color: '#1E40AF' }}>
            Draft post ready
          </div>
          {editMode ? (
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              style={{ width: '100%', minHeight: 120, padding: '10px 12px', fontSize: 13, lineHeight: 1.6, border: 'none', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          ) : (
            <div style={{ padding: '10px 12px', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 150, overflowY: 'auto', color: '#0F172A' }}>
              {msg.content}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, padding: '8px 12px', background: '#F8FAFF', borderTop: '1px solid #E2E8F0' }}>
            {editMode ? (
              <>
                <button onClick={() => handleResume('edited')} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2563EB', color: 'white', cursor: 'pointer', fontWeight: 500 }}>Confirm</button>
                <button onClick={() => setEditMode(false)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: 'white', color: '#475569', cursor: 'pointer' }}>Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => handleResume('approved')} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2563EB', color: 'white', cursor: 'pointer', fontWeight: 500 }}>Approve</button>
                <button onClick={() => { setEditContent(msg.content); setEditMode(true); }} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: 'white', color: '#0F172A', cursor: 'pointer' }}>Edit</button>
                <button onClick={() => handleResume('rejected')} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: 'white', color: '#475569', cursor: 'pointer' }}>Reject</button>
              </>
            )}
          </div>
        </div>
      );
    }
    return (
      <div key={i} className={msg.role === 'user' ? styles.userBubble : styles.aiBubble}>
        {msg.content}
      </div>
    );
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
            {messages.map((msg, i) => renderMessage(msg, i))}
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
              disabled={loading}
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
