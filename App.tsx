import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { formatPosts } from './services/geminiService';
import { FormattedPost, AppState, RenderStatus, RenderedVideo } from './types';
import PostCard from './components/PostCard';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  where,
  onSnapshot, 
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  limit
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

import { SUPPORTED_LANGUAGES } from './constants';

interface ChatMessage {
  id?: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: any;
  postPlaceholders?: FormattedPost[];
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: any;
  stats?: {
    date: string;
    shared: number;
    downloaded: number;
  }
}

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

const ChatGallery: React.FC<{ user: User, chatId: string, messageId: string, placeholders?: FormattedPost[], incrementStat: (type: 'shared' | 'downloaded') => void, setQuotaError: (val: boolean) => void, isLast?: boolean }> = ({ user, chatId, messageId, placeholders, incrementStat, setQuotaError, isLast }) => {
  const [posts, setPosts] = useState<(FormattedPost & { id?: string, imageData?: string })[]>([]);
  const [interactedPosts, setInteractedPosts] = useState<Set<string>>(new Set());
  const [selectedPost, setSelectedPost] = useState<(FormattedPost & { id?: string, imageData?: string }) | null>(null);

  useEffect(() => {
    // Only subscribe for real-time updates if it's the last message or if we don't have all posts yet
    const shouldSubscribe = isLast || (placeholders && posts.length < placeholders.length);
    
    const q = query(
      collection(db, 'users', user.uid, 'posts'),
      where('messageId', '==', messageId),
      orderBy('createdAt', 'asc'),
      limit(250)
    );

    if (isLast) {
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const pData: any[] = [];
        snapshot.docs.forEach(doc => {
          pData.push({ id: doc.id, ...doc.data() });
        });
        setPosts(pData);
        setQuotaError(false);
      }, (error: any) => {
        console.error("Gallery snapshot error:", error);
        if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
          setQuotaError(true);
        }
      });
      return () => unsubscribe();
    } else {
      // For older/completed messages, just show placeholders or have a "Load" button to save quota
      // But we already have the logic to fetch, let's keep it but make it more robust
      const fetchPosts = async () => {
        try {
          const snapshot = await getDocs(q);
          const pData: any[] = [];
          snapshot.docs.forEach(doc => {
            pData.push({ id: doc.id, ...doc.data() });
          });
          setPosts(pData);
        } catch (error: any) {
          console.error("Gallery fetch error:", error);
          if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
            setQuotaError(true);
          }
        }
      };
      
      // Delay fetch slightly to avoid burst on initial load
      const timeout = setTimeout(fetchPosts, 500);
      return () => clearTimeout(timeout);
    }
  }, [user, messageId, setQuotaError, isLast, placeholders?.length]);

  const markInteracted = (postId?: string) => {
    if (!postId) return;
    setInteractedPosts(prev => new Set(prev).add(postId));
  };

  // If we have placeholders but no actual posts yet, show rendering indicators
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
                <img src={post.imageData} className="w-full h-full object-cover" alt="Post" />
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
                 <img src={selectedPost.imageData} alt="Preview" className="w-full object-cover" />
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
                        // Pre-copy to clipboard as a fallback because some apps (Instagram) strip text when sending files
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
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
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
  
  // Chat Sidebar Management
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  
  // Rendering logic for posts
  const [renderingPost, setRenderingPost] = useState<{index: number, post: FormattedPost} | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Auth Listener
  const profileSynced = useRef(false);
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Sync user profile once per day to save quota
        const lastSync = localStorage.getItem(`profile_sync_${u.uid}`);
        const today = new Date().toISOString().split('T')[0];
        
        if (lastSync !== today && !profileSynced.current) {
          try {
            await setDoc(doc(db, 'users', u.uid), {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              photoURL: u.photoURL,
              createdAt: serverTimestamp()
            }, { merge: true });
            profileSynced.current = true;
            localStorage.setItem(`profile_sync_${u.uid}`, today);
          } catch (e: any) {
            console.error("Error syncing user profile", e);
            if (e.code === 'resource-exhausted') setQuotaError(true);
          }
        }
      }
    });
  }, []);

  // 2. Chats Listener
  useEffect(() => {
    if (!user) {
      setChats([]);
      return;
    }
    const q = query(
      collection(db, 'users', user.uid, 'chats'), 
      orderBy('createdAt', 'desc'),
      limit(50) // Limit to save quota
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cData: ChatSession[] = [];
      snapshot.docs.forEach(doc => cData.push({ id: doc.id, ...doc.data() } as ChatSession));
      setChats(cData);
      if (cData.length > 0 && !currentChatId) {
        setCurrentChatId(cData[0].id);
      }
    }, (error) => {
      console.error("Chats fetch error", error);
    });
    return () => unsubscribe();
  }, [user, currentChatId]);

  // 3. Chat History Listener
  const [quotaError, setQuotaError] = useState(false);
  useEffect(() => {
    if (!user || !currentChatId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'users', user.uid, 'messages'),
      where('chatId', '==', currentChatId),
      orderBy('timestamp', 'asc'),
      limit(50) 
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = [];
      snapshot.docs.forEach(doc => {
        msgs.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setMessages(msgs);
      setQuotaError(false);
    }, (error: any) => {
      console.error("Snapshot error:", error);
      if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
        setQuotaError(true);
        // We don't unsubscribe automatically to allow it to potentially reconnect if quota resets,
        // but we flag it to show the error UI.
      } else {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}/messages`);
      }
    });

    return () => unsubscribe();
  }, [user, currentChatId]);

  // 4. Scroll to Bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const incrementStat = async (chatId: string, type: 'shared' | 'downloaded') => {
    if (!user || !chatId) return;
    const today = new Date().toISOString().split('T')[0];
    
    setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      const currentStats = c.stats || { date: today, shared: 0, downloaded: 0 };
      const newStats = currentStats.date === today ? { ...currentStats } : { date: today, shared: 0, downloaded: 0 };
      newStats[type] += 1;
      
      const chatRef = doc(db, 'users', user.uid, 'chats', chatId);
      updateDoc(chatRef, { stats: newStats }).catch(e => console.error("Failed to sync stats:", e));
      
      return { ...c, stats: newStats };
    }));
  };

  const handleSendMessage = async (e?: React.FormEvent, uploadedText?: string) => {
    if (e) e.preventDefault();
    
    const sendText = uploadedText || inputText.trim();
    if (!sendText || !user || isTyping) return;

    setInputText('');
    setIsTyping(true);
    setRenderingProgress(null);

    try {
      let activeChatId = currentChatId;
      
      // Auto-create chat if none exists
      if (!activeChatId) {
        let titleFallback = sendText.substring(0, 30);
        const newChatRef = await addDoc(collection(db, 'users', user.uid, 'chats'), {
          title: titleFallback + (sendText.length > 30 ? '...' : ''),
          createdAt: serverTimestamp()
        });
        activeChatId = newChatRef.id;
        setCurrentChatId(activeChatId);
      }

      // Add user message to Firestore
      await addDoc(collection(db, 'users', user.uid, 'messages'), {
        userId: user.uid,
        chatId: activeChatId,
        role: 'user',
        content: sendText.length > 500 && uploadedText ? `[Uploaded Document]\nExcerpt: ${sendText.substring(0, 200)}...` : sendText,
        timestamp: serverTimestamp()
      });

      // Get response from Gemini
      const generatedPosts = await formatPosts(sendText, targetLang);
      
      if (generatedPosts && generatedPosts.length > 0) {
        const msgRef = await addDoc(collection(db, 'users', user.uid, 'messages'), {
          userId: user.uid,
          chatId: activeChatId,
          role: 'assistant',
          content: `I've generated ${generatedPosts.length} posts for you:`,
          timestamp: serverTimestamp(),
          postPlaceholders: generatedPosts 
        });

        setRenderingProgress({ current: 0, total: generatedPosts.length });

        for (let i = 0; i < generatedPosts.length; i++) {
          setRenderingProgress({ current: i + 1, total: generatedPosts.length });
          await renderAndSyncPost(generatedPosts[i], msgRef.id, activeChatId, i + 1, generatedPosts.length);
        }
      } else {
        await addDoc(collection(db, 'users', user.uid, 'messages'), {
          userId: user.uid,
          chatId: activeChatId,
          role: 'assistant',
          content: "I'm sorry, I couldn't format those posts. Could you try checking your text file to ensure it has enough valid content to generate posts?",
          timestamp: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Chat Error:", error);
    } finally {
      setIsTyping(false);
      setRenderingProgress(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        await handleSendMessage(undefined, text);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleNewChat = async () => {
    if (!user) return;
    try {
      const newChatRef = await addDoc(collection(db, 'users', user.uid, 'chats'), {
        title: 'New Chat',
        createdAt: serverTimestamp()
      });
      setCurrentChatId(newChatRef.id);
      setIsSidebarOpen(false);
    } catch (e) {
      console.error("Failed to create chat", e);
    }
  };

  const confirmDeleteChat = async () => {
    if (!user || !chatToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'chats', chatToDelete));
      if (currentChatId === chatToDelete) setCurrentChatId(null);
      setChatToDelete(null);
    } catch (e) {
      console.error("Failed to delete chat", e);
    }
  };

  const handleRenameChat = async (chatId: string) => {
    if (!user) return;
    try {
      if (editingTitle.trim()) {
        await updateDoc(doc(db, 'users', user.uid, 'chats', chatId), {
          title: editingTitle.trim()
        });
      }
      setEditingChatId(null);
    } catch(e) {
      console.error("Failed to rename chat", e);
    }
  };

  const renderAndSyncPost = async (post: FormattedPost, messageId: string, chatId: string, currentIdx: number, totalIdx: number) => {
    if (!user) return;

    try {
      // Set the post into the off-screen DOM
      setRenderingPost({ index: 0, post });
      
      // Wait for React to mount and the component to signal readiness (font optimization)
      // We also add a hard timeout just in case
      await new Promise(r => {
        const checkReady = () => {
          const el = document.getElementById(`capture-post-0`);
          if (el && el.parentElement?.style.visibility !== 'hidden') {
             // Check if PostCard internal optimization is done
             // Since we use the onReady callback in PostCard, we could use that,
             // but for simplicity in this mass-update, we'll wait 300ms which is usually safe.
             r(null);
          } else {
             setTimeout(checkReady, 50);
          }
        };
        setTimeout(checkReady, 50);
        setTimeout(() => r(null), 1000); // 1s safety backup
      }); 

      const element = document.getElementById(`capture-post-0`);
      if (!element) {
        console.error("Capture element not found in DOM");
        return;
      }

      if (!(window as any).html2canvas) {
        console.warn("html2canvas not loaded yet, waiting...");
        await new Promise(r => setTimeout(r, 1000));
        if (!(window as any).html2canvas) throw new Error("html2canvas missing");
      }

      const canvas = await (window as any).html2canvas(element, {
        scale: 1, 
        backgroundColor: "#000000",
        useCORS: true,
        allowTaint: true,
        width: 1080,
        height: 1350,
        windowWidth: 1080,
        windowHeight: 1350,
        logging: false,
        onclone: (clonedDoc: any) => {
          const el = clonedDoc.getElementById('capture-post-0');
          if (el) {
            el.style.position = 'static';
            el.style.left = '0';
            el.style.top = '0';
            el.style.visibility = 'visible'; // Ensure visible in clone
            el.style.opacity = '1';
          }
        }
      });

      const imageData = canvas.toDataURL('image/jpeg', 0.82);

      // Save mapping instantly
      await addDoc(collection(db, 'users', user.uid, 'posts'), {
        userId: user.uid,
        chatId: chatId,
        messageId: messageId,
        ...post,
        imageData,
        createdAt: serverTimestamp()
      });

    } catch (e) {
      console.error("Render or Save failed:", e);
    } finally {
      if (currentIdx === totalIdx) {
        setRenderingPost(null);
      }
    }
  };

  if (!isAuthReady) {
    return (
      <div className="h-[100dvh] bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error("Login attempt failed:", err);
      if (err.code === 'auth/popup-blocked') {
        setAuthError("Auth popup was blocked by your browser. Please click the icon in your address bar to 'Allow Popups' for this site, then try again.");
      } else {
        setAuthError(err.message || "Login failed. Please check your connection.");
      }
    }
  };

  if (!user) {
    return (
      <div className="h-[100dvh] bg-black flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-900 to-black">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md text-center space-y-8"
        >
          <div className="space-y-4">
            <div className="w-24 h-24 bg-white/5 rounded-3xl mx-auto flex items-center justify-center border border-white/10 shadow-2xl">
              <i className="fa-solid fa-layer-group text-4xl text-white"></i>
            </div>
            <h1 className="text-5xl font-black text-white tracking-tighter">POST MASTER</h1>
            <p className="text-slate-400 text-lg">Your super simple bulk post generator.</p>
          </div>
          
          <div className="space-y-4">
            <button 
              onClick={handleSignIn}
              className="w-full py-5 bg-white text-black font-black text-xl rounded-2xl hover:bg-slate-100 transition-all flex items-center justify-center gap-4 shadow-xl"
            >
              <i className="fa-brands fa-google"></i>
              CONTINUE WITH GOOGLE
            </button>

            {authError && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-xs font-bold leading-relaxed"
              >
                <i className="fa-solid fa-circle-exclamation mr-2"></i>
                {authError}
                <div className="mt-2 text-[10px] opacity-70">
                  Tip: If it persists, try opening the app in a new tab.
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const currentChat = chats.find(c => c.id === currentChatId);
  const todayStr = new Date().toISOString().split('T')[0];
  const stats = currentChat?.stats?.date === todayStr ? currentChat.stats : { shared: 0, downloaded: 0 };

  return (
    <div className="h-[100dvh] w-full bg-black text-white flex overflow-hidden font-sans relative">
      {/* SIDEBAR */}
      <div 
        className={`absolute md:relative z-50 h-full bg-slate-950 border-r border-white/10 flex flex-col transition-all duration-300 ${
          isSidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-black tracking-tight flex items-center gap-2">
            <i className="fa-solid fa-layer-group text-blue-400"></i>
            CHATS
          </h2>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div className="p-2">
          <button 
            onClick={handleNewChat}
            className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-semibold border border-white/10 transition-colors flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-plus"></i> NEW CHAT
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
           {chats.map(chat => (
            <div 
              key={chat.id} 
              className={`w-full group flex items-center p-2 rounded-lg transition-colors ${currentChatId === chat.id ? 'bg-blue-500/20 text-blue-300' : 'text-slate-400 hover:bg-white/5'}`}
            >
               {editingChatId === chat.id ? (
                  <input 
                    autoFocus
                    value={editingTitle}
                    onChange={e => setEditingTitle(e.target.value)}
                    onBlur={() => handleRenameChat(chat.id)}
                    onKeyDown={e => e.key === 'Enter' && handleRenameChat(chat.id)}
                    className="flex-1 bg-transparent border-b border-blue-500 outline-none px-1 text-sm text-white"
                  />
               ) : (
                  <button 
                    onClick={() => { setCurrentChatId(chat.id); setIsSidebarOpen(false); }}
                    className={`flex-1 text-left text-sm truncate font-medium ${currentChatId === chat.id ? 'font-bold' : ''}`}
                  >
                    {chat.title}
                  </button>
               )}
               
               <div className={`flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${currentChatId === chat.id ? 'opacity-100' : ''}`}>
                  <button onClick={(e) => { e.stopPropagation(); setEditingTitle(chat.title); setEditingChatId(chat.id); }} className="p-1.5 hover:text-white" title="Rename">
                    <i className="fa-solid fa-pen text-[10px]"></i>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setChatToDelete(chat.id); }} className="p-1.5 hover:text-red-400" title="Delete">
                    <i className="fa-solid fa-trash text-[10px]"></i>
                  </button>
               </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <img src={user.photoURL || ''} alt="User" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border border-white/20" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{user.displayName}</p>
            </div>
            <button onClick={logout} className="text-slate-500 hover:text-red-400 transition-colors">
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* HEADER */}
        <header className="flex-none h-20 px-6 border-b border-white/10 flex items-center justify-between bg-black/50 backdrop-blur-xl z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-white/70 hover:text-white">
              <i className="fa-solid fa-bars text-xl"></i>
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tighter leading-tight flex items-center gap-2 truncate text-white">
                POST GEN CHAT
              </h1>
              <p className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-widest leading-tight truncate">Bulk Translation Active</p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
            <i className="fa-solid fa-language text-slate-400 text-xs"></i>
            <select 
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="bg-transparent text-white text-[10px] font-black uppercase tracking-widest focus:outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code} className="bg-slate-900 text-white leading-loose">{lang.name}</option>
              ))}
            </select>
          </div>
          {currentChatId && (
            <div className="flex items-center gap-3 sm:gap-4 bg-slate-900 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border border-white/10 text-xs font-bold text-slate-400 shadow-sm shrink-0">
              <div className="flex items-center gap-1.5" title="Shared Today">
                <i className="fa-solid fa-share-nodes text-blue-400"></i>
                <span className="text-white">{stats.shared}</span>
              </div>
              <div className="w-px h-4 bg-white/10"></div>
              <div className="flex items-center gap-1.5" title="Downloaded Today">
                <i className="fa-solid fa-download text-emerald-400"></i>
                <span className="text-white">{stats.downloaded}</span>
              </div>
            </div>
          )}
        </header>

        {/* CHAT MESSAGES */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth"
        >
          <div className="max-w-4xl mx-auto flex flex-col gap-4">
          {quotaError && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-6 text-center space-y-3 mb-4 sticky top-0 z-50 backdrop-blur-md">
              <i className="fa-solid fa-triangle-exclamation text-red-500 text-2xl"></i>
              <h3 className="text-white font-black uppercase tracking-widest text-sm">Quota Exceeded</h3>
              <p className="text-slate-400 text-xs leading-relaxed">
                You've hit the daily free limit for Firestore. This usually resets every 24 hours at midnight US time. 
                Detailed quota information can be found in the Firebase console Sparpk plan pricing.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-500 text-white text-[10px] font-black uppercase rounded-lg"
              >
                Refresh App
              </button>
            </div>
          )}
          <AnimatePresence>
            {messages.map((msg, idx) => (
              <motion.div 
                key={msg.id || idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className={`max-w-[90%] md:max-w-[80%] break-words rounded-2xl px-4 py-3 text-sm shadow-md ${
                  msg.role === 'user' 
                    ? 'bg-white text-black font-semibold' 
                    : 'bg-slate-900 border border-white/5 text-slate-300'
                }`}>
                  <p className="whitespace-pre-wrap break-words overflow-hidden">{msg.content}</p>
                </div>

                {msg.id && (
                  <ChatGallery 
                    user={user} 
                    chatId={currentChatId!}
                    messageId={msg.id} 
                    placeholders={msg.postPlaceholders}
                    incrementStat={(type) => incrementStat(currentChatId!, type)}
                    setQuotaError={setQuotaError}
                    isLast={idx === messages.length - 1}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isTyping && (
            <div className="flex items-center gap-3 py-2 text-slate-500">
              <div className="flex gap-1.5 overflow-hidden">
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-white/40 rounded-full" />
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-white/40 rounded-full" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                  {renderingProgress 
                    ? `Rendering Image ${renderingProgress.current}/${renderingProgress.total}` 
                    : renderingPost 
                      ? 'Finalizing Styles...' 
                      : 'Generating Content...'
                  }
                </span>
                {renderingProgress && (
                  <div className="w-48 h-[3px] bg-white/10 mt-1.5 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                      initial={{ width: 0 }}
                      animate={{ width: `${(renderingProgress.current / renderingProgress.total) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          {!currentChatId && messages.length === 0 && (
            <div className="text-center mt-20 text-slate-500 space-y-4">
              <i className="fa-solid fa-file-lines text-5xl opacity-20"></i>
              <p className="font-semibold text-lg">Start a new batch</p>
              <p className="text-sm max-w-sm mx-auto">Type a prompt or upload a huge .txt file containing hundreds of facts or tips to instantly generate social posts!</p>
            </div>
          )}
        </div>
      </div>

      {/* INPUT AREA */}
      <div className="flex-none p-3 sm:p-6 bg-gradient-to-t from-black via-slate-950 to-transparent border-t border-white/5">
        <div className="max-w-4xl mx-auto mb-3 lg:hidden">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
            <i className="fa-solid fa-language text-slate-400 text-[10px]"></i>
            <select 
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="bg-transparent text-white text-[10px] font-black uppercase tracking-widest focus:outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code} className="bg-slate-900 text-white">{lang.name}</option>
              ))}
            </select>
          </div>
        </div>
        <form 
          onSubmit={handleSendMessage}
          className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3 relative"
        >
          <input 
            type="file" 
            accept=".txt" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isTyping}
            className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 bg-slate-900 border border-white/10 text-white rounded-xl sm:rounded-2xl flex items-center justify-center hover:bg-slate-800 transition-all font-black text-lg sm:text-xl disabled:opacity-50"
            title="Upload .txt File"
          >
            <i className="fa-solid fa-file-arrow-up"></i>
          </button>
          
          <input 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type request or upload .txt"
            className="flex-1 bg-slate-900 h-12 sm:h-16 px-4 sm:px-6 rounded-xl sm:rounded-2xl border border-white/10 focus:border-blue-500/50 outline-none transition-all font-medium text-sm sm:text-base min-w-0"
          />
          <button 
            type="submit"
            disabled={(!inputText.trim()) || isTyping}
            className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 bg-white text-black rounded-xl sm:rounded-2xl flex items-center justify-center hover:bg-slate-200 border border-white disabled:opacity-50 disabled:bg-slate-800 disabled:border-transparent disabled:text-slate-500 transition-all shadow-xl"
          >
            <i className="fa-solid fa-paper-plane text-lg sm:text-xl"></i>
          </button>
        </form>
      </div>
      </div>

        {/* HIDDEN RENDERER */}
      {renderingPost && (
        <div className="fixed" style={{ top: 0, left: 0, width: '1080px', height: '1350px', zIndex: -100, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div id="capture-post-0" style={{ width: '1080px', height: '1350px', position: 'absolute', top: 0, left: 0 }}>
             <PostCard post={renderingPost.post} />
          </div>
        </div>
      )}

      {/* MODALS */}
      <AnimatePresence>
        {chatToDelete && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-white/20 p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white">Delete Chat?</h3>
              <p className="text-slate-400 text-sm">Are you sure you want to delete this batch of generated posts? This cannot be undone.</p>
              <div className="flex gap-3 justify-end mt-6">
                <button onClick={() => setChatToDelete(null)} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-colors">Cancel</button>
                <button onClick={confirmDeleteChat} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-white shadow-lg shadow-red-500/20 transition-colors">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
