import { useState } from 'react';
import { queryAI, resumeAI } from '../../api/ai';

const GREETING = { role: 'assistant', content: 'How may I help you?' };

/**
 * Shared chat/HITL state and logic for the AI Assistant — used by both the
 * floating FAB widget (AIAssistant.jsx) and the inspector rail's embedded
 * panel, so the queryAI/resumeAI approve-edit-reject flow only lives once.
 */
export function useAIChat() {
  const [prompt, setPrompt]           = useState('');
  const [messages, setMessages]       = useState([GREETING]);
  const [loading, setLoading]         = useState(false);
  const [threadId, setThreadId]       = useState(null);
  const [editMode, setEditMode]       = useState(false);
  const [editContent, setEditContent] = useState('');

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

  return {
    prompt, setPrompt,
    messages,
    loading,
    threadId,
    editMode, setEditMode,
    editContent, setEditContent,
    handleSend, handleResume, handleKeyDown,
  };
}
