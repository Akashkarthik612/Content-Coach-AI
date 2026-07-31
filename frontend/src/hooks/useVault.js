import { useState, useEffect, useCallback } from 'react'
import { getFolders, getPostsInFolder, createFolder, createPost, movePost as movePostApi } from '../api/vault'

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

  async function addPost(folderId, title = 'Untitled Post') {
    const post = await createPost(folderId, title)
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

  async function movePost(postId, fromFolderId, toFolderId) {
    const updated = await movePostApi(postId, toFolderId)
    setPostsByFolder(prev => {
      const source = prev[fromFolderId] || []
      const moving = source.find(p => p.id === postId)
      if (!moving) return prev
      return {
        ...prev,
        [fromFolderId]: source.filter(p => p.id !== postId),
        [toFolderId]: [{ ...moving, ...updated }, ...(prev[toFolderId] || [])],
      }
    })
    return updated
  }

  return { folders, postsByFolder, loading, refetch, addFolder, addPost, removePost, updatePost, movePost, removeFolder, updateFolder }
}
