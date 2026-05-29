"use client";
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useState, useRef } from "react";
import { 
  Plus, 
  MessageSquare, 
  LogOut, 
  Edit3, 
  Trash2, 
  Cpu, 
  Send, 
  Sparkles, 
  Search, 
  ShieldAlert, 
  Info, 
  Brain, 
  Check, 
  X, 
  ChevronRight, 
  ExternalLink,
  Lock,
  User as UserIcon,
  Globe,
  Loader,
  ArrowUp,
  Menu,
  ChevronDown,
  Chrome,
  Settings,
  Copy
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User,
  updateProfile
} from "firebase/auth";
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  Timestamp,
  addDoc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { db, auth, handleFirestoreError, OperationType } from "@/lib/firebase";

interface ChatSession {
  id: string;
  name: string;
  userId: string;
  createdAt: any;
}

interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  userId: string;
  createdAt: any;
}

interface CognitiveMemory {
  id: string;
  userId: string;
  content: string;
  createdAt: any;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code block:", err);
    }
  };

  return (
    <div className="my-4 border border-[#2f2f2f] rounded-xl overflow-hidden bg-neutral-950 text-neutral-200 text-left">
      <div className="flex items-center justify-between px-4 py-1.5 bg-neutral-900 border-b border-[#2f2f2f] text-xs font-mono select-none text-neutral-400">
        <span className="capitalize">{language || "code"}</span>
        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-neutral-800 hover:text-white transition-colors cursor-pointer text-teal-400 font-sans"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] font-mono select-text bg-neutral-950">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // App data state
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<CognitiveMemory[]>([]);
  
  // UI inputs and edit modes
  const [inputText, setInputText] = useState("");
  const [newMemoryText, setNewMemoryText] = useState("");
  const [useSearch, setUseSearch] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isExtractingMemory, setIsExtractingMemory] = useState(false);
  
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatName, setEditingChatName] = useState("");
  
  // Custom states matching ChatGPT theme
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isMemoryExpanded, setIsMemoryExpanded] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(true);

  // Search state feedback for the active message
  const [currentSearchQuery, setCurrentSearchQuery] = useState<string | null>(null);
  const [currentSources, setCurrentSources] = useState<{ title: string; url: string }[]>([]);

  // Settings Console States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isAddingSettingsMemory, setIsAddingSettingsMemory] = useState(false);
  const [settingsMemoryText, setSettingsMemoryText] = useState("");

  const messageEndRef = useRef<HTMLDivElement>(null);

  // Sync settings display name input with user profile updates
  useEffect(() => {
    if (user) {
      setNewUsername(user.displayName || "");
    }
  }, [user]);

  // Auto-scroll to message feed bottom
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending, currentSearchQuery]);

  // Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      setUser(usr);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync Chats and Memories from Firestore
  useEffect(() => {
    if (!user) {
      setChats([]);
      setMemories([]);
      setActiveChatId(null);
      return;
    }

    // Sync chats
    const chatsQueryPath = "chats";
    const qChats = query(
      collection(db, chatsQueryPath),
      where("userId", "==", user.uid)
    );

    const unsubscribeChats = onSnapshot(
      qChats,
      (snapshot) => {
        const chatsList: ChatSession[] = [];
        snapshot.forEach((doc) => {
          chatsList.push({ id: doc.id, ...doc.data() } as ChatSession);
        });
        chatsList.sort((a, b) => {
          const tA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || parseInt(a.id) || 0;
          const tB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || parseInt(b.id) || 0;
          return tB - tA;
        });
        setChats(chatsList);
        if (chatsList.length > 0 && !activeChatId) {
          setActiveChatId(chatsList[0].id);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, chatsQueryPath);
      }
    );

    // Sync memories
    const memoriesQueryPath = "memories";
    const qMemories = query(
      collection(db, memoriesQueryPath),
      where("userId", "==", user.uid)
    );

    const unsubscribeMemories = onSnapshot(
      qMemories,
      (snapshot) => {
        const memoriesList: CognitiveMemory[] = [];
        snapshot.forEach((doc) => {
          memoriesList.push({ id: doc.id, ...doc.data() } as CognitiveMemory);
        });
        memoriesList.sort((a, b) => {
          const tA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || parseInt(a.id) || 0;
          const tB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || parseInt(b.id) || 0;
          return tB - tA;
        });
        setMemories(memoriesList);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, memoriesQueryPath);
      }
    );

    return () => {
      unsubscribeChats();
      unsubscribeMemories();
    };
  }, [user]);

  // Sync Messages for Active Chat Room
  useEffect(() => {
    if (!user || !activeChatId) {
      setMessages([]);
      return;
    }

    const messagesQueryPath = `chats/${activeChatId}/messages`;
    const qMessages = query(
      collection(db, "chats", activeChatId, "messages")
    );

    const unsubscribeMessages = onSnapshot(
      qMessages,
      (snapshot) => {
        const messagesList: ChatMessage[] = [];
        snapshot.forEach((doc) => {
          messagesList.push({ id: doc.id, ...doc.data() } as ChatMessage);
        });
        messagesList.sort((a, b) => {
          const tA = a.createdAt?.seconds || a.createdAt?.toMillis?.() || parseInt(a.id) || 0;
          const tB = b.createdAt?.seconds || b.createdAt?.toMillis?.() || parseInt(b.id) || 0;
          return tA - tB;
        });
        setMessages(messagesList);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, messagesQueryPath);
      }
    );

    return () => unsubscribeMessages();
  }, [user, activeChatId]);

  // Login handler
  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Sign in failed:", err);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  // Create Chat Room
  const handleCreateChat = async () => {
    if (!user) return;
    const writePath = "chats";
    try {
      const id = Date.now().toString();
      const newChat: ChatSession = {
        id,
        name: `Cognitive Session ${chats.length + 1}`,
        userId: user.uid,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, writePath, id), newChat);
      setActiveChatId(id);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, writePath);
    }
  };

  // Rename Chat
  const handleStartRename = (session: ChatSession) => {
    setEditingChatId(session.id);
    setEditingChatName(session.name);
  };

  const handleSaveRename = async (id: string) => {
    if (!editingChatName.trim()) return;
    const updatePath = "chats";
    try {
      await updateDoc(doc(db, updatePath, id), { name: editingChatName.trim() });
      setEditingChatId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, updatePath);
    }
  };

  // Delete Chat Room
  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const deletePath = "chats";
    try {
      await deleteDoc(doc(db, deletePath, id));
      if (activeChatId === id) {
        const remaining = chats.filter((c) => c.id !== id);
        setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, deletePath);
    }
  };

  // Add Manual Memory Context Anchor
  const handleAddManualMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMemoryText.trim()) return;
    const writePath = "memories";
    try {
      const id = Date.now().toString();
      const newMemory: CognitiveMemory = {
        id,
        userId: user.uid,
        content: newMemoryText.trim(),
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, writePath, id), newMemory);
      setNewMemoryText("");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, writePath);
    }
  };

  // Delete Memory Fact
  const handleDeleteMemory = async (id: string) => {
    const deletePath = "memories";
    try {
      await deleteDoc(doc(db, deletePath, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, deletePath);
    }
  };

  // Rename account username profile
  const handleRenameUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newUsername.trim()) return;
    setIsRenaming(true);
    try {
      await updateProfile(user, {
        displayName: newUsername.trim()
      });
      setUser({ ...user, displayName: newUsername.trim() } as User);
    } catch (err) {
      console.error("Failed to rename username:", err);
    } finally {
      setIsRenaming(false);
    }
  };

  // Pure data and profile deletion flow
  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmDelete = window.confirm(
      "Are you absolutely sure you want to delete your Zyntros AI account? This will permanently wipe all your chat logs and persistent memories. This action is IRREVERSIBLE."
    );
    if (!confirmDelete) return;

    setIsDeletingAccount(true);
    try {
      // 1. Delete all chat sessions in Firestore belonging to this user
      for (const chat of chats) {
        await deleteDoc(doc(db, "chats", chat.id));
      }
      
      // 2. Delete all memories belonging to this user
      for (const mem of memories) {
        await deleteDoc(doc(db, "memories", mem.id));
      }
      
      // 3. Delete auth account
      await user.delete();
      setUser(null);
    } catch (err: any) {
      console.error("Failed to delete account:", err);
      if (err.code === "auth/requires-recent-login") {
        alert("For security reasons, this action requires a recent authentication. Please sign out, sign back in, and try again.");
      } else {
        alert("Failed to delete account completely: " + (err.message || String(err)));
      }
    } finally {
      setIsDeletingAccount(false);
      setIsSettingsOpen(false);
    }
  };

  // Core Chat dispatching with cognitive anchoring and live Search Grounding
  const handleSendMessage = async (e?: React.FormEvent, textOverride?: string) => {
    if (e) e.preventDefault();
    const currentMsgText = textOverride ? textOverride.trim() : inputText.trim();
    if (!user || !currentMsgText || isSending) return;

    const isFirstMessage = messages.length === 0;

    let chatId = activeChatId;
    if (!chatId) {
      // Auto create a chat if none exists
      const id = Date.now().toString();
      const writePath = "chats";
      try {
        const newChat: ChatSession = {
          id,
          name: `Cognitive Session ${chats.length + 1}`,
          userId: user.uid,
          createdAt: serverTimestamp(),
        };
        await setDoc(doc(db, writePath, id), newChat);
        chatId = id;
        setActiveChatId(id);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, writePath);
        return;
      }
    }

    if (!textOverride) {
      setInputText("");
    }
    setIsSending(true);
    setCurrentSearchQuery(null);
    setCurrentSources([]);

    // 1. Save user message locally in Firestore history
    const userMsgId = Date.now().toString();
    const userMsgWritePath = `chats/${chatId}/messages/${userMsgId}`;
    try {
      const userMessage: ChatMessage = {
        id: userMsgId,
        content: currentMsgText,
        role: "user",
        userId: user.uid,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "chats", chatId, "messages", userMsgId), userMessage);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, userMsgWritePath);
      setIsSending(false);
      return;
    }

    // Prepare long-term memory context texts
    const memoriesContextList = memories.map((m) => m.content);

    // Call server-side API Route /api/chat with our chat logs + memory array
    try {
      // 2. Auto memory extraction from this incoming user text (Parallel extraction)
      setIsExtractingMemory(true);
      fetch("/api/memory-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: currentMsgText })
      }).then(res => res.json())
        .then(async (data) => {
          if (data && Array.isArray(data.memories) && data.memories.length > 0) {
            for (const extractedContent of data.memories) {
              const memId = Math.random().toString(36).substring(2, 11) + Date.now();
              const memDocRef = doc(db, "memories", memId);
              await setDoc(memDocRef, {
                id: memId,
                userId: user.uid,
                content: extractedContent,
                createdAt: serverTimestamp()
              });
            }
          }
          setIsExtractingMemory(false);
        }).catch(err => {
          console.error("Auto memory extraction exception:", err);
          setIsExtractingMemory(false);
        });

      // 3. Dispatch model inference endpoint
      // Limit actual conversation history length passed down
      const historyToSend = messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: currentMsgText,
          history: historyToSend,
          memories: memoriesContextList,
          useSearch: useSearch,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const resData = await response.json();
      
      // Update state feedbacks
      if (resData.searchQuery) {
        setCurrentSearchQuery(resData.searchQuery);
        setIsSearchExpanded(true);
      }
      if (resData.sources) {
        setCurrentSources(resData.sources);
      }

      // Save assistant message to Firestore thread log
      const assistantMsgId = (Date.now() + 1).toString();
      await setDoc(doc(db, "chats", chatId, "messages", assistantMsgId), {
        id: assistantMsgId,
        content: resData.text,
        role: "assistant",
        userId: user.uid,
        createdAt: serverTimestamp(),
      });

      // 4. Auto chat renaming for the first message
      if (isFirstMessage) {
        fetch("/api/rename-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: currentMsgText })
        }).then(res => res.json())
          .then(async (data) => {
            if (data && data.title && data.title.trim()) {
              await updateDoc(doc(db, "chats", chatId), { name: data.title.trim() });
            }
          }).catch(err => {
            console.error("Auto chat renaming exception:", err);
          });
      }

    } catch (err: any) {
      console.error("Inference action failed", err);
      // Inject fail message
      const errMsgId = (Date.now() + 1).toString();
      
      let displayError = "An unexpected server error occurred. Please try again.";
      try {
        const errorText = err.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
        const parsed = JSON.parse(errorText);
        if (parsed.error) {
          try {
            const nested = JSON.parse(parsed.error);
            if (nested.error?.message) {
              displayError = nested.error.message;
            } else if (nested.message) {
              displayError = nested.message;
            } else {
              displayError = parsed.error;
            }
          } catch {
            displayError = parsed.error;
          }
        } else if (parsed.message) {
          displayError = parsed.message;
        }
      } catch {
        displayError = err.message || String(err);
      }

      // Format custom user-friendly hints for Rate Limit / Quota Exhaustion
      if (
        displayError.includes("429") || 
        displayError.toLowerCase().includes("quota") || 
        displayError.toLowerCase().includes("rate limit") || 
        displayError.toLowerCase().includes("resource_exhausted")
      ) {
        displayError = `⚠️ **Groq API Rate Limit / Quota Exceeded**\n\nThe AI system model has encountered a rate limits or quota exceeded block on your Groq API Key.\n\n**To resolve this:**\n1. Wait a few moments (usually 30–60 seconds) for the request rate limits to recover.\n2. Confirm the GROQ_API_KEY is configured correctly under the application **Settings** dashboard.\n3. Reduce the frequency of rapid message transmissions or simplify long chats recursively.`;
      } else {
        displayError = `Error from server: ${displayError}`;
      }

      const assistantMessage: ChatMessage = {
        id: errMsgId,
        content: displayError,
        role: "assistant",
        userId: user.uid,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "chats", chatId, "messages", errMsgId), assistantMessage);
    } finally {
      setIsSending(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#212121] text-neutral-100 font-sans">
        <div className="space-y-4 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full mx-auto"
          />
          <h2 className="text-sm font-medium text-neutral-400 font-sans tracking-tight">Accessing core modules...</h2>
        </div>
      </div>
    );
  }

  // Signed out State
  if (!user) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#171717] overflow-hidden">
        {/* Subtle decorative background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#212121] via-[#171717] to-[#171717] z-0 pointer-events-none" />
        <div className="absolute top-[20%] left-[10%] w-72 h-72 bg-teal-500/5 rounded-full blur-[100px] z-0" />
        <div className="absolute bottom-[20%] right-[10%] w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] z-0" />
        
        <div className="relative z-10 max-w-xl text-center px-6">
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-800 text-neutral-300 text-xs font-mono mb-6 font-medium shadow-lg"
          >
            <Brain className="w-3.5 h-3.5 text-teal-400" />
            <span>Memory AI Companion</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mb-4 animate-fade-in"
          >
            Zyntros AI
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-sm text-neutral-400 leading-relaxed max-w-sm mx-auto mb-10"
          >
            A high-performance conversational AI loaded with secure, persistent cognitive fact memory and live search parameters.
          </motion.p>
          
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col items-center gap-4"
          >
            <button
              onClick={handleLogin}
              id="google-signin-btn"
              className="flex items-center gap-3 px-6 py-3.5 rounded-full bg-white text-neutral-900 hover:bg-neutral-100 transition-colors font-medium text-sm shadow-xl hover:scale-[1.01] transform transition duration-200 active:scale-100 cursor-pointer"
            >
              <Chrome className="w-4 h-4 text-[#EA4335]" />
              <span>Continue with Google</span>
            </button>
            
            <p className="text-neutral-500 text-xs font-sans flex items-center gap-1.5 mt-2">
              <Lock className="w-3.5 h-3.5 text-neutral-600" /> Clean secure Firestore Identity Sandboxing
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#212121] text-neutral-200 font-sans overflow-hidden">
      
      {/* 1. LEFT SIDEBAR PANEL (ChatGPT Style) */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 flex flex-col border-r border-[#2f2f2f] bg-[#171717] transition-transform duration-300 md:static shrink-0 ${
        isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}>
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-[#2f2f2f]/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-400" />
            <span className="font-semibold text-sm tracking-tight text-white font-sans">Zyntros AI</span>
          </div>
          <button
            onClick={() => setIsMobileSidebarOpen(false)}
            className="md:hidden p-1 bg-transparent hover:bg-neutral-800 rounded text-neutral-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* New Thread Button */}
        <div className="p-3.5">
          <button
            onClick={() => {
              handleCreateChat();
              setIsMobileSidebarOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-800/80 border border-[#2f2f2f] text-neutral-100 text-sm font-medium rounded-lg transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-teal-400" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Chat History Thread List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1.5 py-1 scrollbar-thin">
          <div className="px-3 py-1 text-[11px] font-medium text-neutral-500 uppercase tracking-wider select-none">
            Previous Chats
          </div>
          
          {chats.length === 0 ? (
            <div className="px-3 py-6 text-center text-neutral-500 text-xs">
              No threads created yet.
            </div>
          ) : (
            chats.map((session) => {
              const isActive = activeChatId === session.id;
              const isEditing = editingChatId === session.id;

              return (
                <div
                  key={session.id}
                  onClick={() => {
                    if (!isEditing) {
                      setActiveChatId(session.id);
                      setIsMobileSidebarOpen(false);
                    }
                  }}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    isActive 
                      ? "bg-[#2f2f2f] text-white" 
                      : "text-neutral-300 hover:bg-[#212121]/50"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? "text-teal-400" : "text-neutral-500"}`} />
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingChatName}
                        onChange={(e) => setEditingChatName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveRename(session.id)}
                        onBlur={() => handleSaveRename(session.id)}
                        autoFocus
                        className="bg-neutral-900 text-white font-sans text-xs px-1 py-0.5 rounded border border-teal-500/30 focus:outline-none w-full"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-xs font-sans truncate pr-4 text-neutral-200">{session.name}</span>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(session);
                        }}
                        title="Rename"
                        className="p-1 hover:text-teal-400 text-neutral-500 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteChat(session.id, e)}
                        title="Delete"
                        className="p-1 hover:text-rose-400 text-neutral-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* User profile section */}
        <div className="p-3.5 border-t border-[#2f2f2f] flex items-center justify-between bg-[#121212]">
          <div className="flex items-center gap-2 min-w-0">
            {user.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.displayName || "User"} 
                className="w-7.5 h-7.5 rounded-full border border-[#2f2f2f]"
              />
            ) : (
              <div className="w-7.5 h-7.5 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center border border-[#2f2f2f]">
                <UserIcon className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0 flex-1 text-left leading-tight">
              <p className="text-xs font-semibold text-neutral-200 truncate">{user?.displayName || "Google User"}</p>
              <p className="text-[10px] text-neutral-500 truncate" title={user?.email || ""}>{user?.email || "Offline User"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
              className="p-1.5 text-neutral-400 hover:text-teal-400 hover:bg-neutral-850 rounded-md transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onClick={handleLogout}
              id="user-logout-btn"
              title="Sign Out"
              className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-neutral-850 rounded-md transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Background overlay for mobile sidebar */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* 2. CHAT CANVAS AND FEED BOARD (ChatGPT Style) */}
      <main className="flex-1 flex flex-col h-full bg-[#212121] relative overflow-hidden">
        
        {/* Minimal header */}
        <header className="h-14 border-b border-[#2f2f2f]/60 px-4 flex items-center justify-between bg-[#212121]/95 backdrop-blur-sm z-20 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-md transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 text-neutral-200 text-sm font-semibold">
              <span className="text-neutral-400 font-normal">Zyntros AI</span>
              {activeChatId && chats.find(c => c.id === activeChatId) && (() => {
                const currentSession = chats.find(c => c.id === activeChatId)!;
                return (
                  <>
                    <span className="text-[#2f2f2f] select-none">/</span>
                    <span className="text-neutral-200 max-w-[120px] sm:max-w-[200px] md:max-w-[280px] truncate select-none">
                      {currentSession.name}
                    </span>
                    
                    {/* Action buttons next to header name */}
                    <div className="flex items-center gap-0.5 ml-1">
                      <button
                        onClick={() => handleStartRename(currentSession)}
                        title="Rename Chat"
                        className="p-1 text-neutral-500 hover:text-teal-400 rounded transition-colors shrink-0 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteChat(activeChatId, e)}
                        title="Delete Chat"
                        className="p-1 text-neutral-500 hover:text-rose-400 rounded transition-colors shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="flex items-center gap-2 text-neutral-500 font-mono text-[10px]">
            Ready
          </div>
        </header>

        {/* Message logs panel */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-8">
            {messages.length === 0 ? (
              <div className="pt-20 md:pt-28 flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-14 h-14 rounded-full bg-teal-500/5 text-teal-400 flex items-center justify-center border border-teal-500/15 shadow-xl">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-white font-sans">
                  How can I help you today?
                </h1>
                <p className="text-sm text-neutral-400 max-w-md mx-auto leading-relaxed">
                  Zyntros AI uses persistent cognitive memories and dynamic web grounding to understand preferences over time and answer accurately.
                </p>

                {/* Suggestion Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full self-stretch pt-8">
                  {/* Suggestion Column 1 */}
                  <button
                    onClick={() => handleSendMessage(undefined, "What are the long-term memories you currently have recorded about me?")}
                    className="flex flex-col text-left p-4 bg-neutral-800 hover:bg-neutral-700/60 border border-[#2f2f2f] rounded-2xl transition-colors cursor-pointer group"
                  >
                    <span className="text-xs font-semibold text-neutral-200">🔍 Recall preferences</span>
                    <span className="text-[11px] text-neutral-400 mt-1">Review the facts accumulated in my long-term memory.</span>
                  </button>

                  {/* Suggestion Column 2 */}
                  <button
                    onClick={() => handleSendMessage(undefined, "Check the current stock prices and closing indices of S&P 500 and Dow Jones today.")}
                    className="flex flex-col text-left p-4 bg-neutral-800 hover:bg-neutral-700/60 border border-[#2f2f2f] rounded-2xl transition-colors cursor-pointer group"
                  >
                    <span className="text-xs font-semibold text-neutral-200">📈 Stock market updates</span>
                    <span className="text-[11px] text-neutral-400 mt-1">Triggers active real-time web grounding search.</span>
                  </button>

                  {/* Suggestion Column 3 */}
                  <button
                    onClick={() => handleSendMessage(undefined, "What are the latest events, date, and news headlines making waves right now in 2026?")}
                    className="flex flex-col text-left p-4 bg-neutral-800 hover:bg-neutral-700/60 border border-[#2f2f2f] rounded-2xl transition-colors cursor-pointer group"
                  >
                    <span className="text-xs font-semibold text-neutral-200">📰 Latest news headlines</span>
                    <span className="text-[11px] text-neutral-400 mt-1">Get precise details of news and live current status.</span>
                  </button>

                  {/* Suggestion Column 4 */}
                  <button
                    onClick={() => handleSendMessage(undefined, "Give me 5 creative side project ideas pairing Next.js, Groq, and serverless databases.")}
                    className="flex flex-col text-left p-4 bg-neutral-800 hover:bg-neutral-700/60 border border-[#2f2f2f] rounded-2xl transition-colors cursor-pointer group"
                  >
                    <span className="text-xs font-semibold text-neutral-200">💡 Brainstorm coding tasks</span>
                    <span className="text-[11px] text-neutral-400 mt-1">No web search necessary, answered natively from Groq knowledge.</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {messages.map((msg, index) => {
                  const isUser = msg.role === "user";
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-4 md:gap-6 ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      {/* Avatar for Assistant */}
                      {!isUser && (
                        <div className="w-8 h-8 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20 shrink-0 shadow-sm">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      )}

                      <div className={`leading-relaxed min-w-0 max-w-[85%] ${isUser ? "flex flex-col items-end" : "flex-1"}`}>
                        {/* User content rendered cleanly */}
                        {isUser ? (
                          <div className="bg-[#2f2f2f] text-neutral-100 rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
                            {msg.content}
                          </div>
                        ) : (
                          // Assistant response with fully formatted Markdown custom components
                          <div className="pr-2 pt-0.5">
                            <ReactMarkdown
                              components={{
                                p: ({children}) => <p className="mb-4 last:mb-0 leading-relaxed text-neutral-200 text-sm md:text-[15px]">{children}</p>,
                                strong: ({children}) => <strong className="font-semibold text-white">{children}</strong>,
                                h1: ({children}) => <h1 className="text-xl font-bold mt-6 mb-2.5 text-white tracking-tight">{children}</h1>,
                                h2: ({children}) => <h2 className="text-lg font-bold mt-5 mb-2 text-white tracking-tight">{children}</h2>,
                                h3: ({children}) => <h3 className="text-base font-bold mt-4 mb-1 text-white tracking-tight">{children}</h3>,
                                ul: ({children}) => <ul className="list-disc pl-5 mb-4 space-y-1.5 text-neutral-200 text-sm md:text-[15px]">{children}</ul>,
                                ol: ({children}) => <ol className="list-decimal pl-5 mb-4 space-y-1.5 text-neutral-200 text-sm md:text-[15px]">{children}</ol>,
                                li: ({children}) => <li className="leading-relaxed">{children}</li>,
                                code: ({className, children, ...props}) => {
                                  const match = /language-(\w+)/.exec(className || "");
                                  const inline = !match;
                                  return inline ? (
                                    <code className="bg-neutral-800 text-teal-300 px-1.5 py-0.5 rounded text-xs font-mono font-medium" {...props}>
                                      {children}
                                    </code>
                                  ) : (
                                    <CodeBlock language={match?.[1] || "code"} code={String(children).replace(/\n$/, "")} />
                                  );
                                }
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>

                            {/* Show memory auto analyzing feedback nested nicely in the assistant thread */}
                            {isExtractingMemory && index === messages.length - 1 && (
                              <div className="flex items-center gap-1.5 text-[10px] text-teal-400 mt-2 font-mono">
                                <Loader className="w-3 h-3 animate-spin" />
                                <span>Evaluating user statement for long-term memory updates...</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Basic loading animation when AI is answering */}
                {isSending && (
                  <div className="flex items-start gap-4 md:gap-6 py-2">
                    <div className="w-8 h-8 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20 shrink-0">
                      <Sparkles className="w-4 h-4 text-teal-400 animate-spin" style={{ animationDuration: "3s" }} />
                    </div>
                    
                    <div className="flex items-center gap-1.5 py-3.5 pl-1.5 pb-2">
                      <div className="w-2 h-2 bg-teal-400/80 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-2 h-2 bg-teal-400/80 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-2 bg-teal-400/80 rounded-full animate-bounce" />
                    </div>
                  </div>
                )}

                {/* Beautiful ChatGPT Search Grounding card inline blocks */}
                {!isSending && currentSearchQuery && (
                  <div className="flex gap-4 md:gap-6 border-t border-[#2f2f2f]/40 pt-4">
                    <div className="w-8 h-8 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20 shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>

                    <div className="flex-1 space-y-2 text-left">
                      <div 
                        onClick={() => setIsSearchExpanded(!isSearchExpanded)}
                        className="inline-flex items-center gap-2 text-xs text-neutral-300 font-medium cursor-pointer py-1.5 px-3 rounded-full bg-neutral-800 border border-neutral-700 hover:bg-neutral-700/60 select-none"
                      >
                        <Globe className="w-3.5 h-3.5 text-teal-400" />
                        <span>Searched web for &quot;{currentSearchQuery}&quot;</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${isSearchExpanded ? "rotate-180" : ""}`} />
                      </div>

                      {/* Display retrieved sources exactly like ChatGPT badge grid */}
                      {isSearchExpanded && currentSources.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2.5 max-w-2xl">
                          {currentSources.map((src, sIdx) => {
                            let domain = "web";
                            try {
                              domain = new URL(src.url).hostname.replace("www.", "");
                            } catch {}

                            return (
                              <a
                                key={sIdx}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex flex-col p-2.5 bg-neutral-800 hover:bg-neutral-700/60 border border-[#2f2f2f] rounded-xl text-left transition-colors min-w-0"
                              >
                                <span className="text-xs font-semibold text-neutral-200 truncate">{src.title}</span>
                                <span className="text-[10px] text-neutral-500 truncate flex items-center gap-1 mt-1 font-mono">
                                  <Globe className="w-2.5 h-2.5 text-neutral-600" />
                                  <span>{domain}</span>
                                </span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messageEndRef} />
          </div>
        </div>

        {/* Dynamic footer input container */}
        <footer className="w-full shrink-0 border-t border-[#2f2f2f]/60 bg-[#212121]/95 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-4 py-4 md:py-5">
            <form onSubmit={handleSendMessage} className="relative flex items-center bg-neutral-800 border border-[#2f2f2f] rounded-2xl p-1 shadow-md focus-within:border-neutral-600 transition-all gap-1">
              <button
                type="button"
                onClick={() => setUseSearch(!useSearch)}
                className={`ml-1.5 p-2 rounded-xl transition-colors shrink-0 flex items-center justify-center cursor-pointer ${
                  useSearch 
                    ? "bg-teal-500/10 text-teal-400 border border-teal-500/15" 
                    : "text-neutral-500 hover:text-neutral-400 hover:bg-neutral-750"
                }`}
                title={useSearch ? "Disable Web Search" : "Enable Web Search"}
              >
                <Globe className="w-4 h-4" />
              </button>
              
              <input
                type="text"
                placeholder="Ask anything..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-transparent text-sm text-neutral-100 placeholder-neutral-500 pl-1.5 py-3 focus:outline-none pr-14"
                disabled={isSending}
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="submit"
                  disabled={isSending || !inputText.trim()}
                  className="p-2.5 bg-teal-500 hover:bg-teal-400 text-neutral-950 font-bold rounded-xl disabled:opacity-30 disabled:hover:bg-teal-500 transition-colors shrink-0 flex items-center justify-center cursor-pointer shadow-lg shadow-teal-500/10"
                  title="Send message"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </form>
            <p className="text-[10px] text-neutral-500 text-center mt-3 font-sans select-none">
              Zyntros AI may display inaccurate facts. Consider verifying real-time links where active.
            </p>
          </div>
        </footer>

      </main>

      {/* 3. SETTINGS OVERLAY PANEL */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#212121] border border-[#2f2f2f] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Settings Header */}
              <div className="p-5 border-b border-[#2f2f2f] flex justify-between items-center bg-[#1a1a1a]">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-teal-400" />
                  <h3 className="font-semibold text-base text-white font-sans tracking-tight">Settings Console</h3>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Panel content */}
              <div className="p-6 space-y-6 overflow-y-auto scrollbar-thin flex-1 text-left">
                {/* 1. Account / Username Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest font-sans">Profile Identity & Name</h4>
                  <form onSubmit={handleRenameUsername} className="flex gap-2.5">
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="Enter new display name"
                      className="flex-1 bg-neutral-900 border border-[#2f2f2f] text-sm px-3.5 py-2 rounded-xl focus:outline-none focus:border-teal-500/50 text-neutral-100 font-sans"
                    />
                    <button
                      type="submit"
                      disabled={isRenaming || !newUsername.trim()}
                      className="px-4 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-neutral-950 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      {isRenaming ? "Saving..." : "Rename"}
                    </button>
                  </form>
                </div>

                {/* 2. Persistent Long-Term Memories Section */}
                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest font-sans">Persistent Cognitive Facts</h4>
                      <p className="text-[10px] text-neutral-500 leading-normal font-sans">
                        These are the long-term facts extracted from your conversations or registered manually.
                      </p>
                    </div>
                    <span className="text-[10px] bg-neutral-800 text-teal-300 px-2.5 py-1 rounded-full border border-neutral-700 font-mono">
                      {memories.length} facts
                    </span>
                  </div>

                  {/* Manual input for adding settings memory */}
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!settingsMemoryText.trim() || !user) return;
                    setIsAddingSettingsMemory(true);
                    try {
                      const id = Date.now().toString();
                      await setDoc(doc(db, "memories", id), {
                        id,
                        userId: user.uid,
                        content: settingsMemoryText.trim(),
                        createdAt: serverTimestamp()
                      });
                      setSettingsMemoryText("");
                    } catch (err) {
                      console.error("Failed to add memory:", err);
                    } finally {
                      setIsAddingSettingsMemory(false);
                    }
                  }} className="flex gap-2">
                    <input
                      type="text"
                      value={settingsMemoryText}
                      onChange={(e) => setSettingsMemoryText(e.target.value)}
                      placeholder="Manually register a custom permanent fact..."
                      className="flex-1 bg-neutral-900 border border-[#2f2f2f] text-xs px-3 py-2 rounded-xl focus:outline-none focus:border-teal-500/50 text-neutral-100 font-sans"
                    />
                    <button
                      type="submit"
                      disabled={isAddingSettingsMemory || !settingsMemoryText.trim()}
                      className="px-3 bg-neutral-850 hover:bg-neutral-800 text-teal-300 border border-teal-500/15 font-bold text-xs rounded-xl transition-colors cursor-pointer shrink-0 font-sans"
                    >
                      + Register
                    </button>
                  </form>

                  {/* Fact List */}
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1 border border-[#2f2f2f]/30 rounded-xl p-3 bg-neutral-900/40 divide-y divide-[#2f2f2f]/40 scrollbar-thin">
                    {memories.length === 0 ? (
                      <p className="text-[11px] text-neutral-500 text-center py-6 leading-normal font-sans">
                        No active long-term memories registered yet.
                      </p>
                    ) : (
                      memories.map((mem, mIdx) => (
                        <div 
                          key={mem.id} 
                          className={`flex items-start justify-between gap-3 text-xs text-neutral-300 leading-relaxed ${mIdx > 0 ? "pt-2 mt-2" : ""}`}
                        >
                          <p className="flex-1 leading-normal pr-2 font-sans">{mem.content}</p>
                          <button
                            onClick={() => handleDeleteMemory(mem.id)}
                            className="p-1 hover:text-rose-400 text-neutral-500 cursor-pointer shrink-0 mt-0.5 rounded transition-colors hover:bg-neutral-800/40"
                            title="Delete Fact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 3. Account Deletion Area */}
                <div className="border-t border-[#2f2f2f]/65 pt-6 space-y-3">
                  <h4 className="text-xs font-semibold text-rose-500 uppercase tracking-widest font-sans">Danger Zone</h4>
                  <div className="p-4 bg-rose-950/20 border border-rose-500/15 rounded-xl space-y-3 text-left">
                    <p className="text-xs text-rose-300 leading-normal font-sans">
                      Permanently delete your account along with all active chat threads, message histories, and cumulative persistent memory. This action cannot be undone.
                    </p>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={isDeletingAccount}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-md shadow-rose-950/30"
                    >
                      {isDeletingAccount ? "Processing deletion..." : "Delete Account & Data"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Settings Footer */}
              <div className="p-4 border-t border-[#2f2f2f] flex justify-end bg-[#1a1a1a]">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-750 text-neutral-200 hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer border border-[#2f2f2f]"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
