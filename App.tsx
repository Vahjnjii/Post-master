import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FormattedPost } from './types';
import PostCard from './components/PostCard';
import { motion, AnimatePresence } from 'motion/react';
import { SUPPORTED_LANGUAGES } from './constants';
import { formatPosts } from './services/geminiService';

// Internal Types for Cloudflare API
interface ApiKey {
  id: string;
  keyLabel: string;
  apiKey: string;
  quotaExhausted: boolean;
  createdAt: string;
}
interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  postPlaceholders?: FormattedPost[];
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  sharedCount: number;
  downloadedCount: number;
}

// Global API Helper
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(endpoint, { ...options, headers });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
    }
    throw new Error(`API Error: ${response.statusText}`);
  }
  return response.json();
};

const triggerDownload = async (dataUrl: string, filename: string) => {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  } catch (e) {
    console.error("Blob download failed, falling back", e);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }
};

const ChatGallery: React.FC<{ 
  chatId: string, 
  messageId: string, 
  placeholders?: FormattedPost[], 
  incrementStat: (type: 'shared' | 'downloaded') => void, 
  setQuotaError: (val: boolean) => void, 
  isLast?: boolean 
}> = ({ chatId, messageId, placeholders, incrementStat, setQuotaError, isLast }) => {
  const [posts, setPosts] = useState<(FormattedPost & { id?: string, imageData?: string })[]>([]);
  const [interactedPosts, setInteractedPosts] = useState<Set<string>>(new Set());
  const [selectedPost, setSelectedPost] = useState<(FormattedPost & { id?: string, imageData?: string }) | null>(null);

  const fetchPosts = async () => {
    try {
      const data = await apiFetch(`/api/messages/${messageId}/posts`);
      setPosts(data);
    } catch (e) {
      console.error("Gallery fetch error:", e);
    }
  };

  useEffect(() => {
    fetchPosts();
    // In a real Cloudflare app, you might use WebSockets or Polling here
    // For simplicity, we fetch once, or every few seconds if it's the last message
    if (isLast && placeholders && posts.length < placeholders.length) {
      const interval = setInterval(fetchPosts, 3000);
      return () => clearInterval(interval);
    }
  }, [messageId, isLast, placeholders?.length]);

  const markInteracted = async (postId?: string) => {
    if (!postId) return;
    setInteractedPosts(prev => new Set(prev).add(postId));
    try {
      await apiFetch(`/api/posts/${postId}`, {
        method: 'PATCH',
        body: JSON.stringify({ interacted: true })
      });
    } catch (e) { console.error(e); }
  };

  const displayPosts = useMemo(() => {
    if (posts.length > 0) return posts;
    return placeholders || [];
  }, [posts, placeholders]);

  if (displayPosts.length === 0) return null;

  return (
    <div className="w-full mt-2">
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-1.5 w-full">
        {displayPosts.map((post: any, pIdx: number) => (
          <div 
            key={post.id || pIdx}
            onClick={() => post.imageData && setSelectedPost(post)}
            className={`aspect-square sm:aspect-[4/5] bg-slate-900 rounded border transition-all duration-300 relative group overflow-hidden ${interactedPosts.has(post.id) ? 'border-green-500' : 'border-white/20'} ${post.imageData ? 'cursor-pointer' : ''}`}
          >
            {post.imageData ? (
              <>
                <img src={post.imageData} className="w-full h-full object-cover" alt="Post" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <i className="fa-solid fa-expand text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow"></i>
                </div>
                {interactedPosts.has(post.id) && (
                  <div className="absolute top-1 right-1 bg-green-500 text-black w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-black shadow z-10">
                    <i className="fa-solid fa-check"></i>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                <div className="w-4 h-4 border-2 border-slate-800 border-t-slate-500 rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selectedPost && selectedPost.imageData && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
            onClick={() => setSelectedPost(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-slate-900 rounded-3xl border border-white/10 p-5 flex flex-col gap-5 shadow-2xl relative"
            >
              <button 
                onClick={() => setSelectedPost(null)}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors z-10"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
              
              <div className="rounded-xl overflow-hidden border border-white/20 relative">
                 <img src={selectedPost.imageData} alt="Preview" className="w-full object-cover" referrerPolicy="no-referrer" />
              </div>

              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => {
                    triggerDownload(selectedPost.imageData!, `post-${selectedPost.title || 'generated'}.jpg`);
                    markInteracted(selectedPost.id);
                    incrementStat('downloaded');
                    setSelectedPost(null);
                  }}
                  className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border border-white/10"
                >
                  <i className="fa-solid fa-download"></i> Save
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch(selectedPost.imageData!);
                      const blob = await res.blob();
                      const file = new File([blob], 'post.jpg', { type: 'image/jpeg' });
                      if (navigator.share && navigator.canShare({ files: [file] })) {
                        await navigator.clipboard.writeText(`${selectedPost.title}\n\n${selectedPost.hashtags.join(' ')}`).catch(() => {});
                        await navigator.share({
                          files: [file],
                          title: selectedPost.title,
                          text: `${selectedPost.title}\n\n${selectedPost.hashtags.join(' ')}`
                        });
                      } else {
                        triggerDownload(selectedPost.imageData!, 'post.jpg');
                      }
                    } catch (e) { console.error("Share failed", e); }
                    markInteracted(selectedPost.id);
                    incrementStat('shared');
                    setSelectedPost(null);
                  }}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
                >
                  <i className="fa-solid fa-share-nodes"></i> Share
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isAuthReady, setIsAuthReady] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [targetLang, setTargetLang] = useState('auto');
  const [renderingProgress, setRenderingProgress] = useState<{current: number, total: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [renderingPost, setRenderingPost] = useState<{index: number, post: FormattedPost} | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Settings & API Keys
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [isKeyPromptOpen, setIsKeyPromptOpen] = useState(false);

  // Fetch API Keys
  const fetchKeys = async () => {
    if (!user) return;
    try {
      const data = await apiFetch('/api/keys');
      setApiKeys(data);
      if (data.length === 0) setIsKeyPromptOpen(true);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchKeys();
  }, [user]);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    try {
      await apiFetch('/api/keys', {
        method: 'POST',
        body: JSON.stringify({ 
          keyLabel: newKeyLabel || `Key ${apiKeys.length + 1}`, 
          apiKey: newKey.trim() 
        })
      });
      setNewKey('');
      setNewKeyLabel('');
      fetchKeys();
      setIsKeyPromptOpen(false);
    } catch (e) { console.error(e); }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await apiFetch(`/api/keys/${id}`, { method: 'DELETE' });
      fetchKeys();
    } catch (e) { console.error(e); }
  };

  // Fetch Chats
  const fetchChats = async () => {
    if (!user) return;
    try {
      const data = await apiFetch('/api/chats');
      setChats(data);
      if (data.length > 0 && !currentChatId) {
        setCurrentChatId(data[0].id);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchChats();
  }, [user]);

  // Fetch Messages when chat changes
  useEffect(() => {
    const fetchMessages = async () => {
      if (!user || !currentChatId) {
        setMessages([]);
        return;
      }
      try {
        const data = await apiFetch(`/api/chats/${currentChatId}/messages`);
        setMessages(data);
      } catch (e) { console.error(e); }
    };
    fetchMessages();
    // Poll for updates if typing
    const interval = isTyping ? setInterval(fetchMessages, 3000) : null;
    return () => { if (interval) clearInterval(interval); };
  }, [user, currentChatId, isTyping]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const incrementStat = async (chatId: string, type: 'shared' | 'downloaded') => {
    try {
      await apiFetch(`/api/chats/${chatId}/stats`, {
        method: 'POST',
        body: JSON.stringify({ type })
      });
      fetchChats();
    } catch (e) { console.error(e); }
  };

  const handleSendMessage = async (e?: React.FormEvent, uploadedText?: string) => {
    if (e) e.preventDefault();
    const sendText = uploadedText || inputText.trim();
    if (!sendText || !user || isTyping) return;

    setInputText('');
    setIsTyping(true);

    try {
      let activeChatId = currentChatId;
      if (!activeChatId) {
        const newChat = await apiFetch('/api/chats', {
          method: 'POST',
          body: JSON.stringify({ title: sendText.substring(0, 30) + (sendText.length > 30 ? '...' : '') })
        });
        activeChatId = newChat.id;
        setCurrentChatId(activeChatId);
      }

      await apiFetch('/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          chatId: activeChatId,
          role: 'user',
          content: sendText.length > 500 && uploadedText ? `[Uploaded Document]\nExcerpt: ${sendText.substring(0, 200)}...` : sendText
        })
      });

      // KEY ROTATION GENERATION
      let generatedPosts: any[] = [];
      let success = false;
      
      const availableKeys = apiKeys.filter(k => !k.quotaExhausted);
      if (availableKeys.length === 0) {
        throw new Error("No active API keys found. Please add one in settings.");
      }

      for (const keyObj of availableKeys) {
        try {
          generatedPosts = await formatPosts(sendText, keyObj.apiKey, targetLang);
          success = true;
          break;
        } catch (err: any) {
          console.error(`Key ${keyObj.keyLabel} failed`, err);
          if (err.message?.includes('quota') || err.status === 429) {
            await apiFetch(`/api/keys/${keyObj.id}/exhausted`, { method: 'PATCH' });
            fetchKeys();
            continue;
          }
          throw err;
        }
      }

      if (!success) throw new Error("All API keys failed. Check quotas.");
      
      if (generatedPosts && generatedPosts.length > 0) {
        const assistantMsg = await apiFetch('/api/messages', {
          method: 'POST',
          body: JSON.stringify({
            chatId: activeChatId,
            role: 'assistant',
            content: `I've generated ${generatedPosts.length} posts for you:`,
            postPlaceholders: generatedPosts
          })
        });

        setRenderingProgress({ current: 0, total: generatedPosts.length });

        for (let i = 0; i < generatedPosts.length; i++) {
          setRenderingProgress({ current: i + 1, total: generatedPosts.length });
          await renderAndSyncPost(generatedPosts[i], assistantMsg.id, activeChatId, i + 1, generatedPosts.length);
        }
      } else {
        await apiFetch('/api/messages', {
          method: 'POST',
          body: JSON.stringify({
            chatId: activeChatId,
            role: 'assistant',
            content: "I'm sorry, I couldn't format those posts. Try a different text file."
          })
        });
      }
    } catch (error) {
      console.error("Chat Error:", error);
    } finally {
      setIsTyping(false);
      setRenderingProgress(null);
      fetchChats();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) await handleSendMessage(undefined, text);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleNewChat = async () => {
    if (!user) return;
    try {
      const newChat = await apiFetch('/api/chats', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Chat' })
      });
      setCurrentChatId(newChat.id);
      setIsSidebarOpen(false);
      fetchChats();
    } catch (e) { console.error(e); }
  };

  const confirmDeleteChat = async () => {
    if (!user || !chatToDelete) return;
    try {
      await apiFetch(`/api/chats/${chatToDelete}`, { method: 'DELETE' });
      if (currentChatId === chatToDelete) setCurrentChatId(null);
      setChatToDelete(null);
      fetchChats();
    } catch (e) { console.error(e); }
  };

  const handleRenameChat = async (chatId: string) => {
    if (!user || !editingTitle.trim()) { setEditingChatId(null); return; }
    try {
      await apiFetch(`/api/chats/${chatId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: editingTitle.trim() })
      });
      setEditingChatId(null);
      fetchChats();
    } catch(e) { console.error(e); }
  };

  const renderAndSyncPost = async (post: FormattedPost, messageId: string, chatId: string, currentIdx: number, totalIdx: number) => {
    if (!user) return;
    try {
      setRenderingPost({ index: 0, post });
      await new Promise(r => setTimeout(r, 600)); // Wait for render
      const element = document.getElementById(`capture-post-0`);
      if (!element || !(window as any).html2canvas) return;

      const canvas = await (window as any).html2canvas(element, {
        scale: 1, backgroundColor: "#000000", useCORS: true, allowTaint: true,
        width: 1080, height: 1350, windowWidth: 1080, windowHeight: 1350
      });

      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      await apiFetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify({ chatId, messageId, ...post, imageData })
      });
    } catch (e) {
      console.error("Render failed:", e);
    } finally {
      if (currentIdx === totalIdx) setRenderingPost(null);
    }
  };

  const handleSignIn = async () => {
    // FOR PREVIEW: Mock Login
    // FOR CLOUDFLARE: Replace with real OAuth login window as per oauth-integration skill
    const mockUser = {
      uid: 'user_' + Math.random().toString(36).substr(2, 9),
      email: 'demo@example.com',
      displayName: 'Cloudflare User',
      photoURL: `https://picsum.photos/seed/${Math.random()}/200`
    };

    try {
      const data = await apiFetch('/api/auth/mock', {
        method: 'POST',
        body: JSON.stringify(mockUser)
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (err) {
      setAuthError("Failed to connect to backend. Ensure server is running.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setChats([]);
    setMessages([]);
    setCurrentChatId(null);
  };

  if (!user) {
    return (
      <div className="h-[100dvh] bg-black flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900 to-black">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center space-y-8">
          <div className="space-y-4">
            <div className="w-24 h-24 bg-white/5 rounded-3xl mx-auto flex items-center justify-center border border-white/10 shadow-2xl">
              <i className="fa-solid fa-cloud text-4xl text-blue-400"></i>
            </div>
            <h1 className="text-5xl font-black text-white tracking-tighter uppercase italic">Post Cloud</h1>
            <p className="text-slate-400 text-lg">Cloudflare-Powered Bulk Generation</p>
          </div>
          <button onClick={handleSignIn} className="w-full py-5 bg-white text-black font-black text-xl rounded-2xl hover:bg-slate-100 transition-all flex items-center justify-center gap-4 shadow-xl">
            <i className="fa-solid fa-bolt"></i> GET STARTED (DEMO)
          </button>
          {authError && <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-xs font-bold">{authError}</div>}
        </motion.div>
      </div>
    );
  }

  const currentChat = chats.find(c => c.id === currentChatId);

  return (
    <div className="h-[100dvh] w-full bg-black text-white flex overflow-hidden font-sans relative">
      {/* SIDEBAR */}
      <div className={`absolute md:relative z-50 h-full bg-slate-950 border-r border-white/10 flex flex-col transition-all duration-300 ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:translate-x-0'}`}>
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-black tracking-tight flex items-center gap-2">
            <i className="fa-solid fa-layer-group text-blue-400"></i> BATCHES
          </h2>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="p-2">
          <button onClick={handleNewChat} className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-semibold border border-white/10 transition-colors flex items-center justify-center gap-2">
            <i className="fa-solid fa-plus"></i> NEW CHAT
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
           {chats.map(chat => (
            <div key={chat.id} className={`w-full group flex items-center p-2 rounded-lg transition-colors ${currentChatId === chat.id ? 'bg-blue-500/20 text-blue-300' : 'text-slate-400 hover:bg-white/5'}`}>
               {editingChatId === chat.id ? (
                  <input autoFocus value={editingTitle} onChange={e => setEditingTitle(e.target.value)} onBlur={() => handleRenameChat(chat.id)} onKeyDown={e => e.key === 'Enter' && handleRenameChat(chat.id)} className="flex-1 bg-transparent border-b border-blue-500 outline-none px-1 text-sm text-white" />
               ) : (
                  <button onClick={() => { setCurrentChatId(chat.id); setIsSidebarOpen(false); }} className={`flex-1 text-left text-sm truncate font-medium ${currentChatId === chat.id ? 'font-bold' : ''}`}>{chat.title}</button>
               )}
               <div className={`flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${currentChatId === chat.id ? 'opacity-100' : ''}`}>
                  <button onClick={(e) => { e.stopPropagation(); setEditingTitle(chat.title); setEditingChatId(chat.id); }} className="p-1.5 hover:text-white" title="Rename"><i className="fa-solid fa-pen text-[10px]"></i></button>
                  <button onClick={(e) => { e.stopPropagation(); setChatToDelete(chat.id); }} className="p-1.5 hover:text-red-400" title="Delete"><i className="fa-solid fa-trash text-[10px]"></i></button>
               </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <img src={user.photoURL || ''} alt="User" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border border-white/20" />
            <div className="flex-1 min-w-0"><p className="text-xs font-bold truncate">{user.displayName}</p></div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors"><i className="fa-solid fa-right-from-bracket"></i></button>
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"><i className="fa-solid fa-gear"></i></button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex-none h-20 px-6 border-b border-white/10 flex items-center justify-between bg-black/50 backdrop-blur-xl z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-white/70 hover:text-white"><i className="fa-solid fa-bars text-xl"></i></button>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tighter leading-tight flex items-center gap-2 truncate text-white uppercase italic">Post Cloud</h1>
              <p className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-widest leading-tight truncate">Cloudflare Ready</p>
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
            <i className="fa-solid fa-language text-slate-400 text-xs"></i>
            <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="bg-transparent text-white text-[10px] font-black uppercase tracking-widest focus:outline-none cursor-pointer">
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code} className="bg-slate-900 text-white leading-loose">{lang.name}</option>
              ))}
            </select>
          </div>
          {currentChatId && (
            <div className="flex items-center gap-3 sm:gap-4 bg-slate-900 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-white/10 text-xs font-bold text-slate-400 shadow-sm shrink-0">
              <div className="flex items-center gap-1.5" title="Shared"><i className="fa-solid fa-share-nodes text-blue-400"></i><span className="text-white">{currentChat?.sharedCount || 0}</span></div>
              <div className="w-px h-4 bg-white/10"></div>
              <div className="flex items-center gap-1.5" title="Downloaded"><i className="fa-solid fa-download text-emerald-400"></i><span className="text-white">{currentChat?.downloadedCount || 0}</span></div>
            </div>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
          <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <AnimatePresence>
            {messages.map((msg, idx) => (
              <motion.div key={msg.id || idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] md:max-w-[80%] break-words rounded-2xl px-4 py-3 text-sm shadow-md ${msg.role === 'user' ? 'bg-white text-black font-semibold' : 'bg-slate-900 border border-white/5 text-slate-300'}`}>
                  <p className="whitespace-pre-wrap break-words overflow-hidden">{msg.content}</p>
                </div>
                {msg.id && (
                  <ChatGallery 
                    chatId={currentChatId!}
                    messageId={msg.id} 
                    placeholders={msg.postPlaceholders}
                    incrementStat={(type) => incrementStat(currentChatId!, type)}
                    setQuotaError={() => {}} 
                    isLast={idx === messages.length - 1}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {isTyping && (
            <div className="flex items-center gap-3 py-2 text-slate-500">
              <div className="flex gap-1.5 overflow-hidden"><motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-white/40 rounded-full" /><motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-white/40 rounded-full" /><motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-white/40 rounded-full" /></div>
              <div className="flex flex-col"><span className="text-[10px] font-black uppercase tracking-widest text-slate-300">{renderingProgress ? `Rendering Image ${renderingProgress.current}/${renderingProgress.total}` : renderingPost ? 'Finalizing Styles...' : 'Generating Content...'}</span>{renderingProgress && (<div className="w-48 h-[3px] bg-white/10 mt-1.5 rounded-full overflow-hidden"><motion.div className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" initial={{ width: 0 }} animate={{ width: `${(renderingProgress.current / renderingProgress.total) * 100}%` }} /></div>)}</div>
            </div>
          )}
          {!currentChatId && messages.length === 0 && (
            <div className="text-center mt-20 text-slate-500 space-y-4">
              <i className="fa-solid fa-cloud text-5xl opacity-20"></i>
              <p className="font-semibold text-lg italic">Ready for the Cloud</p>
              <p className="text-sm max-w-sm mx-auto">This app is now running on its own local backend, matching Cloudflare's D1 structure. Generate away!</p>
            </div>
          )}
          </div>
        </div>

        <div className="flex-none p-3 sm:p-6 bg-gradient-to-t from-black via-slate-950 to-transparent border-t border-white/5">
          <div className="max-w-4xl mx-auto mb-3 lg:hidden">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
              <i className="fa-solid fa-language text-slate-400 text-[10px]"></i>
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="bg-transparent text-white text-[10px] font-black uppercase tracking-widest focus:outline-none cursor-pointer">
                {SUPPORTED_LANGUAGES.map(lang => (<option key={lang.code} value={lang.code} className="bg-slate-900 text-white">{lang.name}</option>))}
              </select>
            </div>
          </div>
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3 relative">
            <input type="file" accept=".txt" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isTyping} className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 bg-slate-900 border border-white/10 text-white rounded-xl sm:rounded-2xl flex items-center justify-center hover:bg-slate-800 transition-all font-black text-lg sm:text-xl disabled:opacity-50"><i className="fa-solid fa-file-arrow-up"></i></button>
            <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type request or upload .txt" className="flex-1 bg-slate-900 h-12 sm:h-16 px-4 sm:px-6 rounded-xl sm:rounded-2xl border border-white/10 focus:border-blue-500/50 outline-none transition-all font-medium text-sm sm:text-base min-w-0" />
            <button type="submit" disabled={(!inputText.trim()) || isTyping} className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 bg-white text-black rounded-xl sm:rounded-2xl flex items-center justify-center hover:bg-slate-200 border border-white disabled:opacity-50 transition-all shadow-xl"><i className="fa-solid fa-paper-plane text-lg sm:text-xl"></i></button>
          </form>
        </div>
      </div>

      {renderingPost && (
        <div className="fixed" style={{ top: 0, left: 0, width: '1080px', height: '1350px', zIndex: -100, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div id="capture-post-0" style={{ width: '1080px', height: '1350px', position: 'absolute', top: 0, left: 0 }}>
             <PostCard post={renderingPost.post} />
          </div>
        </div>
      )}

      <AnimatePresence>
        {chatToDelete && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-slate-900 border border-white/20 p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl">
              <h3 className="text-xl font-bold text-white">Delete Chat?</h3>
              <p className="text-slate-400 text-sm">Are you sure you want to delete this batch? This cannot be undone.</p>
              <div className="flex gap-3 justify-end mt-6">
                <button onClick={() => setChatToDelete(null)} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-colors">Cancel</button>
                <button onClick={confirmDeleteChat} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-white shadow-lg transition-colors">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SETTINGS MODAL */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[400] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-slate-900 border border-white/10 p-6 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">AI Settings</h2>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Manage your Gemini Keys</p>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="w-10 h-10 bg-white/5 hover:bg-white/10 text-white rounded-full flex items-center justify-center transition-colors">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                <section>
                  <h3 className="text-sm font-black text-white uppercase mb-3 flex items-center gap-2">
                    <i className="fa-solid fa-plus text-blue-400"></i> Add New API Key
                  </h3>
                  <form onSubmit={handleAddKey} className="space-y-3">
                    <input 
                      value={newKeyLabel} 
                      onChange={e => setNewKeyLabel(e.target.value)} 
                      placeholder="Label (e.g. Work Account)" 
                      className="w-full bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500/50 outline-none"
                    />
                    <div className="flex gap-2">
                      <input 
                        value={newKey} 
                        onChange={e => setNewKey(e.target.value)} 
                        placeholder="Paste Gemini API Key here" 
                        className="flex-1 bg-black/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500/50 outline-none"
                      />
                      <button type="submit" disabled={!newKey.trim()} className="px-6 py-3 bg-white text-black font-black uppercase text-xs rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-all">Add</button>
                    </div>
                    <p className="text-[10px] text-slate-500">You can get a free Gemini API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400 underline" rel="noreferrer">Google AI Studio</a>.</p>
                  </form>
                </section>

                <section>
                  <h3 className="text-sm font-black text-white uppercase mb-3 flex items-center gap-2">
                    <i className="fa-solid fa-key text-emerald-400"></i> Active Keys ({apiKeys.length})
                  </h3>
                  <div className="space-y-2">
                    {apiKeys.map(key => (
                      <div key={key.id} className="bg-white/5 border border-white/5 p-3 rounded-xl flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white flex items-center gap-2">
                            {key.keyLabel}
                            {key.quotaExhausted && <span className="bg-red-500/20 text-red-500 text-[8px] px-1.5 py-0.5 rounded border border-red-500/30 uppercase">Exhausted</span>}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono truncate">{key.apiKey.substring(0, 8)}••••••••••••••••</p>
                        </div>
                        <button onClick={() => handleDeleteKey(key.id)} className="p-2 text-slate-500 hover:text-red-400 transition-colors">
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    ))}
                    {apiKeys.length === 0 && (
                      <div className="text-center py-8 border border-dashed border-white/10 rounded-2xl text-slate-500 bg-white/5">
                        <i className="fa-solid fa-circle-info mb-2 opacity-50"></i>
                        <p className="text-xs font-medium">No custom keys added yet.</p>
                        <p className="text-[10px] opacity-70">Will use default systemic key if available.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* INITIAL KEY PROMPT */}
      <AnimatePresence>
        {isKeyPromptOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[500] bg-black/95 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-slate-900 border border-white/10 p-8 rounded-[2rem] max-w-md w-full shadow-2xl text-center space-y-6">
              <div className="w-20 h-20 bg-blue-500/10 rounded-3xl mx-auto flex items-center justify-center border border-blue-500/20">
                <i className="fa-solid fa-brain text-4xl text-blue-400"></i>
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Connect Gemini</h2>
                <p className="text-slate-400 text-sm">To start generating posts, please provide your Gemini API key. This key will be stored securely on your backend.</p>
              </div>
              <form onSubmit={handleAddKey} className="space-y-4">
                <input 
                  value={newKey} 
                  onChange={e => setNewKey(e.target.value)} 
                  placeholder="Paste AI API Key here..." 
                  className="w-full bg-black h-16 rounded-2xl border border-white/10 px-6 text-white focus:border-blue-500/50 outline-none transition-all font-mono"
                />
                <button type="submit" disabled={!newKey.trim()} className="w-full py-5 bg-white text-black font-black uppercase text-lg rounded-2xl hover:bg-slate-200 transition-all shadow-xl disabled:opacity-50">
                  ACTIVATE SYSTEM
                </button>
              </form>
              <p className="text-slate-500 text-xs text-balance">
                You can generate multiple keys from <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400 underline decoration-2 underline-offset-4" rel="noreferrer">Google AI Studio</a> to bypass usage limits.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
