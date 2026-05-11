import { createContext, useState } from 'react';
import { useFolders } from './hooks/useFolders';
import { usePosts } from './hooks/usePosts';
import { Sidebar } from './components/Sidebar/Sidebar';
import { PostList } from './components/PostList/PostList';
import { Editor } from './components/Editor/Editor';

export const AppContext = createContext(null);

export default function App() {
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedPostId, setSelectedPostId]   = useState(null);

  // Editor modes
  const [mode, setMode] = useState('idle'); // 'idle' | 'newFolder' | 'newPost' | 'post'

  const { folders, refetch: refetchFolders } = useFolders();
  const { posts, refetch: refetchPosts }     = usePosts(selectedFolderId);

  function openNewFolder() {
    setSelectedPostId(null);
    setMode('newFolder');
  }

  function openNewPost() {
    setSelectedPostId(null);
    setMode('newPost');
  }

  function openPost(postId) {
    setSelectedPostId(postId);
    setMode('post');
  }

  function selectFolder(folderId) {
    setSelectedFolderId(folderId);
    setSelectedPostId(null);
    setMode('idle');
  }

  const ctx = {
    // Folder
    folders, refetchFolders,
    selectedFolderId, selectFolder,
    // Post
    posts, refetchPosts,
    selectedPostId,
    // Editor mode
    mode, setMode,
    openNewFolder, openNewPost, openPost,
  };

  return (
    <AppContext.Provider value={ctx}>
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-app)' }}>
        <Sidebar />
        <Editor />
        <PostList />
      </div>
    </AppContext.Provider>
  );
}
