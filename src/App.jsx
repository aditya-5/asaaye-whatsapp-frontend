import { useState, useEffect, useCallback, useRef } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { LogOut, ShieldAlert, Users } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import TemplatePicker from './components/TemplatePicker';
import ContactPicker from './components/ContactPicker';
import BulkBlastModal from './components/BulkBlastModal';
import AnalyticsPage from './pages/AnalyticsPage';
import { api } from './api';
import { useWebSocket } from './hooks/useWebSocket';

const TOAST_OPTS = {
  style: { background: '#111B21', color: '#E9EDEF', border: '1px solid #2A3942', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', borderRadius: '8px', fontSize: '13px' },
  success: { iconTheme: { primary: '#00A884', secondary: '#111B21' } },
};

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesCache, setMessagesCache] = useState({});
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateInitialContact, setTemplateInitialContact] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [blastContacts, setBlastContacts] = useState(null);
  const [authed, setAuthed] = useState(() => localStorage.getItem('auth') === 'true');
  const [password, setPassword] = useState('');
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [notionContacts, setNotionContacts] = useState([]);

  // Inline ref update: always current on every render, no useEffect delay
  const activeConvRef = useRef(null);
  activeConvRef.current = activeConversation;

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations(data);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { api.getNotionContacts().then(setNotionContacts).catch(() => {}); }, []);

  useEffect(() => {
    if (!activeConversation) { setMessages([]); return; }
    if (messagesCache[activeConversation.id]) setMessages(messagesCache[activeConversation.id]);
    api.getMessages(activeConversation.id)
      .then(data => { setMessages(data); setMessagesCache(prev => ({ ...prev, [activeConversation.id]: data })); })
      .catch(console.error);
  }, [activeConversation?.id]);

  const handleWSMessage = useCallback((event) => {
    if (event.type === 'new_message') {
      const msg = event.data;
      const activConv = activeConvRef.current;
      if (activConv && msg.conversation_id === activConv.id) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      }
      // Keep cache up to date for all conversations (so switching back shows new messages)
      setMessagesCache(cache => {
        const key = msg.conversation_id;
        if (!cache[key]) return cache;
        if (cache[key].some(m => m.id === msg.id)) return cache;
        return { ...cache, [key]: [...cache[key], msg] };
      });
      if (msg.direction === 'inbound') {
        const name = msg.contact?.name || msg.contact?.phone || 'Unknown';
        toast(`${name}: ${msg.content?.substring(0, 60) || 'New message'}`, {
          icon: '💬', style: TOAST_OPTS.style, duration: 4000,
        });
      }
      loadConversations();
    } else if (event.type === 'reaction_update') {
      const upd = event.data;
      const reactionsJson = upd.reactions && Object.keys(upd.reactions).length
        ? JSON.stringify(upd.reactions) : null;
      const applyReact = (m) => m.id === upd.message_id
        ? { ...m, reactions: reactionsJson }
        : m;
      setMessages(prev => prev.map(applyReact));
      setMessagesCache(cache => {
        const key = upd.conversation_id;
        if (!cache[key]) return cache;
        return { ...cache, [key]: cache[key].map(applyReact) };
      });
    } else if (event.type === 'status_update') {
      const upd = event.data;
      const applyUpdate = (m) =>
        m.id === upd.message_id || (upd.wamid && m.wamid === upd.wamid)
          ? { ...m, status: upd.status, error_message: upd.error_message }
          : m;
      setMessages(prev => prev.map(applyUpdate));
      setMessagesCache(cache => {
        const key = upd.conversation_id;
        if (!cache[key]) return cache;
        return { ...cache, [key]: cache[key].map(applyUpdate) };
      });
      if (upd.status === 'failed') {
        if (upd.error_message) toast.error(upd.error_message, { duration: 8000 });
        setActiveConversation(prev => {
          if (prev && prev.id === upd.conversation_id) {
            api.getMessages(prev.id).then(data => {
              setMessages(data);
              setMessagesCache(c => ({ ...c, [prev.id]: data }));
            });
          }
          return prev;
        });
      }
    }
  }, [loadConversations]);

  // On every WS connect (including reconnects), re-fetch active conversation messages
  // to catch any status updates that arrived while the socket was down (e.g. iOS PWA sleep)
  const handleWSConnect = useCallback(() => {
    setActiveConversation(prev => {
      if (prev) {
        api.getMessages(prev.id).then(data => {
          setMessages(data);
          setMessagesCache(c => ({ ...c, [prev.id]: data }));
        }).catch(() => {});
      }
      return prev;
    });
  }, []);

  const { connected } = useWebSocket(handleWSMessage, handleWSConnect);

  const createNotionIfNew = useCallback((phone, name = '') => {
    const norm = (p) => p.replace(/[\s\-+()]/g, '');
    const cp = norm(phone);
    const exists = notionContacts.some(nc => {
      const np = norm(nc.phone);
      return np === cp || np === cp.replace(/^91/, '') || '91' + np === cp;
    });
    if (!exists) {
      api.createNotionContact(phone, name).catch(() => {});
      setNotionContacts(prev => [...prev, { name: name || phone, phone, segments: ['WhatsApp Initiated'] }]);
    }
  }, [notionContacts]);

  const optimisticConvUpdate = useCallback((convId, text, now) => {
    setConversations(prev => {
      const updated = prev.map(c => c.id === convId
        ? { ...c, last_message: { content: text, direction: 'outbound' }, last_message_at: now }
        : c);
      const idx = updated.findIndex(c => c.id === convId);
      return idx > 0 ? [updated[idx], ...updated.filter((_, i) => i !== idx)] : updated;
    });
  }, []);

  const handleSendMessage = async (text, replyToWamid = null) => {
    if (!activeConversation) return;
    const tempId = `temp_${Date.now()}`;
    const now = new Date().toISOString();
    setMessages(prev => [...prev, {
      id: tempId, conversation_id: activeConversation.id,
      direction: 'outbound', content: text, message_type: 'text',
      status: 'pending', timestamp: now, reply_to_wamid: replyToWamid,
    }]);
    optimisticConvUpdate(activeConversation.id, text, now);
    try {
      const msg = await api.sendText(activeConversation.contact.phone, text, null, replyToWamid);
      setMessages(prev => {
        const without = prev.filter(m => m.id !== tempId);
        return without.some(m => m.id === msg.id) ? without : [...without, msg];
      });
      loadConversations();
      createNotionIfNew(activeConversation.contact.phone, activeConversation.contact.name || '');
    } catch {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'failed', error_message: 'Failed to send' } : m));
      toast.error('Failed to send message');
    }
  };

  const handleSendMedia = async (phone, mediaType, mediaUrl, caption = '') => {
    const tempId = `temp_${Date.now()}`;
    const now = new Date().toISOString();
    const preview = `[${mediaType === 'video' ? 'Video' : 'Image'} Attachment]\n${mediaUrl}\n${caption}`;
    if (activeConversation) {
      setMessages(prev => [...prev, {
        id: tempId, conversation_id: activeConversation.id,
        direction: 'outbound', content: preview, message_type: mediaType,
        status: 'pending', timestamp: now,
      }]);
      optimisticConvUpdate(activeConversation.id, `📎 ${mediaType === 'video' ? 'Video' : 'Image'}`, now);
    }
    try {
      const msg = await api.sendMedia({ phone, media_type: mediaType, media_url: mediaUrl, caption });
      setMessages(prev => {
        const without = prev.filter(m => m.id !== tempId);
        return without.some(m => m.id === msg.id) ? without : [...without, msg];
      });
      loadConversations();
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      toast.error('Failed to send media');
    }
  };

  const handleReactToMessage = async (messageId, emoji) => {
    try {
      const result = await api.reactToMessage(messageId, emoji);
      const applyReact = (m) => m.id === messageId
        ? { ...m, reactions: result.reactions && Object.keys(result.reactions).length ? JSON.stringify(result.reactions) : null }
        : m;
      setMessages(prev => prev.map(applyReact));
      setMessagesCache(cache => {
        if (!activeConversation) return cache;
        const key = activeConversation.id;
        if (!cache[key]) return cache;
        return { ...cache, [key]: cache[key].map(applyReact) };
      });
    } catch { toast.error('Failed to send reaction'); }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await api.deleteMessage(messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      loadConversations();
      toast.success('Message deleted');
    } catch { toast.error('Failed to delete message'); }
  };

  const handleDeleteChat = async (conversationId) => {
    if (!window.confirm('Delete this chat and all its history?')) return;
    try {
      await api.deleteConversation(conversationId);
      if (activeConversation?.id === conversationId) setActiveConversation(null);
      loadConversations();
      toast.success('Chat deleted');
    } catch { toast.error('Failed to delete chat'); }
  };

  const handleSendTemplate = async (data) => {
    toast.promise(
      api.sendTemplate(data).then(async (msg) => {
        const convs = await api.getConversations();
        setConversations(convs);
        const conv = convs.find(c => c.contact.phone === data.phone);
        if (conv) {
          setActiveConversation(conv);
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        }
        createNotionIfNew(data.phone, data.contact_name || '');
      }),
      { loading: 'Sending...', success: 'Queued ✓', error: e => e.message || 'Failed to send' }
    );
  };

  // ContactPicker: open chat with a single Notion contact
  const handleSelectSingleContact = (contact) => {
    const existing = conversations.find(c => c.contact.phone === contact.phone);
    if (existing) {
      setActiveConversation(existing);
    } else {
      setTemplateInitialContact(contact);
      setShowTemplatePicker(true);
    }
  };

  if (!authed) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-wa-dark p-4">
        <div className="bg-wa-input p-6 rounded-xl border border-wa-border max-w-sm w-full text-center">
          <h2 className="text-xl font-bold text-wa-text mb-4">Login Required</h2>
          <input type="password" placeholder="Enter password..." value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (password === (import.meta.env.VITE_APP_PASSWORD || 'saumya@asaaye')) { localStorage.setItem('auth', 'true'); setAuthed(true); }
                else toast.error('Incorrect password', { ...TOAST_OPTS });
              }
            }}
            className="w-full bg-wa-dark text-wa-text rounded-lg px-4 py-2 border border-wa-border focus:ring-1 focus:ring-wa-green/50 outline-none mb-4"
          />
          <button onClick={() => {
            if (password === (import.meta.env.VITE_APP_PASSWORD || 'saumya@asaaye')) { localStorage.setItem('auth', 'true'); setAuthed(true); }
            else toast.error('Incorrect password', { ...TOAST_OPTS });
          }} className="w-full bg-wa-green text-wa-darker py-2 rounded-lg font-bold">
            Access Dashboard
          </button>
        </div>
        <Toaster position="top-right" toastOptions={TOAST_OPTS} />
      </div>
    );
  }

  if (showAnalytics) {
    return (
      <div className="h-screen flex">
        <AnalyticsPage onBack={() => setShowAnalytics(false)} />
        <Toaster position="top-right" toastOptions={TOAST_OPTS} />
      </div>
    );
  }

  const norm = (p) => p.replace(/[\s\-+()]/g, '');
  const conversationsWithNames = notionContacts.length
    ? conversations.map(conv => {
        if (conv.contact.name) return conv;
        const cp = norm(conv.contact.phone);
        const match = notionContacts.find(nc => {
          const np = norm(nc.phone);
          return np === cp || np === cp.replace(/^91/, '') || '91' + np === cp;
        });
        return match?.name ? { ...conv, contact: { ...conv.contact, name: match.name } } : conv;
      })
    : conversations;

  return (
    <div className="flex-1 flex overflow-hidden w-full min-h-0">
      <Toaster position="top-right" toastOptions={TOAST_OPTS} />

      {/* Sidebar */}
      <div className={`flex-col h-full bg-wa-dark shrink-0 w-full md:w-[380px] md:max-w-[380px] border-r border-wa-border ${activeConversation ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex-1 overflow-y-auto">
          <Sidebar
            conversations={conversationsWithNames}
            activeId={activeConversation?.id}
            loading={conversationsLoading}
            onSelect={conv => { setActiveConversation(conv); setShowAnalytics(false); }}
            onNewChat={() => { setTemplateInitialContact(null); setShowTemplatePicker(true); }}
          />
        </div>

        {/* Bottom nav */}
        <div className="bg-wa-dark border-t border-wa-border px-4 py-2 flex items-center gap-2 w-full">
          <button onClick={() => setShowContactPicker(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg hover:bg-wa-hover transition-colors text-wa-muted text-sm">
            <Users size={16} />
            Contacts
          </button>
          <button onClick={() => setShowAnalytics(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg hover:bg-wa-hover transition-colors text-wa-muted text-sm">
            <ShieldAlert size={16} />
            Admin
          </button>
          <button onClick={() => { localStorage.removeItem('auth'); setAuthed(false); }}
            className="p-2 rounded-lg hover:bg-wa-hover transition-colors text-red-400/80 hover:text-red-400" title="Logout">
            <LogOut size={18} />
          </button>
          <div className={`w-2 h-2 shrink-0 rounded-full ml-1 ${connected ? 'bg-wa-green' : 'bg-red-400'}`}
            title={connected ? 'Connected' : 'Disconnected'} />
        </div>
      </div>

      {/* Chat */}
      <div className={`flex-1 h-full w-full ${!activeConversation ? 'hidden md:flex' : 'flex'}`}>
        <ChatView
          conversation={activeConversation}
          messages={messages}
          onSendMessage={handleSendMessage}
          onSendMedia={handleSendMedia}
          onDeleteMessage={handleDeleteMessage}
          onDeleteChat={() => activeConversation && handleDeleteChat(activeConversation.id)}
          onReactToMessage={handleReactToMessage}
          onOpenTemplate={() => { setTemplateInitialContact(activeConversation?.contact || null); setShowTemplatePicker(true); }}
          onBack={() => setActiveConversation(null)}
          onUpdateContact={newName => {
            setActiveConversation(prev => ({ ...prev, contact: { ...prev.contact, name: newName } }));
            loadConversations();
            if (activeConversation) createNotionIfNew(activeConversation.contact.phone, newName);
          }}
          onConversationUpdate={loadConversations}
        />
      </div>

      {/* Modals */}
      {showTemplatePicker && (
        <TemplatePicker
          onClose={() => { setShowTemplatePicker(false); setTemplateInitialContact(null); }}
          onSend={handleSendTemplate}
          initialContact={templateInitialContact}
        />
      )}
      {showContactPicker && (
        <ContactPicker
          onClose={() => setShowContactPicker(false)}
          onSelectSingle={handleSelectSingleContact}
          onSelectMultiple={contacts => { setBlastContacts(contacts); setShowContactPicker(false); }}
        />
      )}
      {blastContacts && (
        <BulkBlastModal contacts={blastContacts} onClose={() => setBlastContacts(null)} />
      )}
    </div>
  );
}
