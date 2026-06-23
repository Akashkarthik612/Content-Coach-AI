import { useState, useEffect, useCallback } from 'react'
import { getFolders, getPostsInFolder, createFolder, createPost } from '../api/vault'

// Rotating tint palette — matches the approved Vault design's 5 folder colors.
// Real folders have no inherent "platform", so color is assigned by position.
export const FOLDER_TINTS = [
  { color: '#2563EB', tint: '#EAF0FF' },
  { color: '#0EA5E9', tint: '#E6F6FE' },
  { color: '#6366F1', tint: '#EEF0FF' },
  { color: '#FF4500', tint: '#FFF1EC' },
  { color: '#8B5CF6', tint: '#F3EEFF' },
]

/**
 * Real vault data (folders + posts), shaped for the Content Vault page.
 * TODO: connect content store / import pipeline (§B4 of the Vault prompt).
 */
export function useVault() {
  const [folders, setFolders] = useState([])
  const [postsByFolder, setPostsByFolder] = useState({})
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const folderList = await getFolders()
      setFolders(folderList)
      const entries = await Promise.all(
        folderList.map(async f => [f.id, await getPostsInFolder(f.id)])
      )
      setPostsByFolder(Object.fromEntries(entries))
    } catch (err) {
      console.error('useVault: failed to load', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refetch() }, [refetch])

  async function addFolder(name) {
    const folder = await createFolder(name, '')
    setFolders(prev => [folder, ...prev])
    setPostsByFolder(prev => ({ ...prev, [folder.id]: [] }))
    return folder
  }

  async function addPost(folderId) {
    const post = await createPost(folderId, 'Untitled Post')
    setPostsByFolder(prev => ({ ...prev, [folderId]: [post, ...(prev[folderId] || [])] }))
    return post
  }

  function removeFolder(folderId) {
    setFolders(prev => prev.filter(f => f.id !== folderId))
    setPostsByFolder(prev => {
      const next = { ...prev }
      delete next[folderId]
      return next
    })
  }

  function updateFolder(folderId, updates) {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, ...updates } : f))
  }

  function removePost(postId) {
    setPostsByFolder(prev => {
      const next = {}
      for (const [fid, posts] of Object.entries(prev)) {
        next[fid] = posts.filter(p => p.id !== postId)
      }
      return next
    })
  }

  function updatePost(postId, updates) {
    setPostsByFolder(prev => {
      const next = {}
      for (const [fid, posts] of Object.entries(prev)) {
        next[fid] = posts.map(p => p.id === postId ? { ...p, ...updates } : p)
      }
      return next
    })
  }

  return { folders, postsByFolder, loading, refetch, addFolder, addPost, removePost, updatePost, removeFolder, updateFolder }
}
