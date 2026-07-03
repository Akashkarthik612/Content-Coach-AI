// Chat history API — TODO: wire to real backend endpoints
// All functions resolve .data so callers do NOT add .data themselves.
// Replace stub bodies with real axios calls when the backend is ready.

// TODO: import api from './vault' or create a shared axios instance

export const listChats = () =>
  Promise.resolve([])

export const getChat = (_chatId) =>
  Promise.resolve({ chat: null, messages: [] })

export const createChat = (firstPrompt) =>
  Promise.resolve({ id: `chat_${Date.now()}`, title: (firstPrompt || 'New chat').slice(0, 60) })

export const renameChat = (chatId, title) =>
  Promise.resolve({ id: chatId, title })

export const deleteChat = (_chatId) =>
  Promise.resolve({})
