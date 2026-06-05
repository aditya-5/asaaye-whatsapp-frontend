import { useState, useEffect, useCallback } from 'react';
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
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [blastContacts, setBlastContacts] = useState(null);
  const [authed, setAuthed] = useState(() => localStorage.getItem('auth') === 'true');
  const [password, setPassword] = useState('');

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations(data);
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!activeConversation) { setMessages([]); return; }
    if (messagesCache[activeConversation.id]) setMessages(messagesCache[activeConversation.id]);
    api.getMessages(activeConversation.id)
      .then(data => { setMessages(data); setMessagesCache(prev => ({ ...prev, [activeConversation.id]: data })); })
      .catch(console.error);
  }, [activeConversation]);

  const handleWSMessage = useCallback((event) => {
    if (event.type === 'new_message') {
      const msg = event.data;
      if (activeConversation && msg.conversation_id === activeConversation.id) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      }
      if (msg.direction === 'inbound') {
        const name = msg.contact?.name || msg.contact?.phone || 'Unknown';
        toast(`${name}: ${msg.content?.substring(0, 60) || 'New message'}`, {
          icon: '💬', style: TOAST_OPTS.style, duration: 4000,
        });
      }
      loadConversations();
    } else if (event.type === 'status_update') {
      setMessages(prev => prev.map(m => m.id === event.data.message_id ? { ...m, status: event.data.status } : m));
    }
  }, [activeConversation, loadConversations]);

  const { connected } = useWebSocket(handleWSMessage);

  const handleSendMessage = async (text) => {
    if (!activeConversation) return;
    try {
      const msg = await api.sendText(activeConversation.contact.phone, text);
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      loadConversations();
    } catch { toast.error('Failed to send message'); }
  };

  const handleSendMedia = async (phone, mediaType, mediaUrl) => {
    try {
      const msg = await api.sendMedia({ phone, media_type: mediaType, media_url: mediaUrl, caption: '' });
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      loadConversations();
    } catch { toast.error('Failed to send media'); }
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
    toast.promise(api.sendTemplate(data).then(() => loadConversations()), {
      loading: 'Sending template...', success: 'Template sent!', error: 'Failed to send template',
    });
  };

  // ContactPicker: open chat with a single Notion contact
  const handleSelectSingleContact = (contact) => {
    // Find existing conversation or set phone for new template chat
    const existing = conversations.find(c => c.contact.phone === contact.phone);
    if (existing) {
      setActiveConversation(existing);
    } else {
      // Open template picker pre-filled for this contact
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

  return (
    <div className="flex-1 flex overflow-hidden w-full min-h-0">
      <Toaster position="top-right" toastOptions={TOAST_OPTS} />

      {/* Sidebar */}
      <div className={`flex-col h-full bg-wa-dark shrink-0 w-full md:w-[380px] md:max-w-[380px] border-r border-wa-border ${activeConversation ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex-1 overflow-y-auto">
          <Sidebar
            conversations={conversations}
            activeId={activeConversation?.id}
            onSelect={conv => { setActiveConversation(conv); setShowAnalytics(false); }}
            onNewChat={() => setShowTemplatePicker(true)}
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
          onBack={() => setActiveConversation(null)}
          onUpdateContact={newName => {
            setActiveConversation(prev => ({ ...prev, contact: { ...prev.contact, name: newName } }));
            loadConversations();
          }}
          onConversationUpdate={loadConversations}
        />
      </div>

      {/* Modals */}
      {showTemplatePicker && (
        <TemplatePicker onClose={() => setShowTemplatePicker(false)} onSend={handleSendTemplate} />
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
