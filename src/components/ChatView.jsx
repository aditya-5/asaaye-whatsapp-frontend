import { useState, useEffect, useRef } from 'react';
import {
  Send, User, Check, CheckCheck, Clock, AlertCircle, Trash2, ArrowLeft, ChevronLeft, Edit2,
  StickyNote, Bell, BellRing, Paperclip, Zap, X, Plus, Loader, ChevronDown, Smile,
  LayoutTemplate, CornerUpLeft
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../api';
import { getInitials } from './Sidebar';

const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', active: 'bg-wa-green text-wa-darker border-wa-green', inactive: 'text-wa-muted border-wa-border' },
  { value: 'pending', label: 'Pending', active: 'bg-yellow-400 text-black border-yellow-400', inactive: 'text-wa-muted border-wa-border' },
  { value: 'closed', label: 'Closed', active: 'bg-wa-muted text-wa-darker border-wa-muted', inactive: 'text-wa-muted border-wa-border' },
];

const STATUS_COLOR = { open: 'text-wa-green', pending: 'text-yellow-400', closed: 'text-wa-muted' };

function StatusIcon({ status }) {
  switch (status) {
    case 'sent': return <Check size={14} className="text-wa-muted" />;
    case 'delivered': return <CheckCheck size={14} className="text-wa-muted" />;
    case 'read': return <CheckCheck size={14} className="text-wa-blue" />;
    case 'failed': return <AlertCircle size={14} className="text-red-400" />;
    default: return <Clock size={14} className="text-wa-muted" />;
  }
}

const escapeHtml = (t) => {
  if (!t) return '';
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
};
const formatWhatsAppText = (text) => {
  if (!text) return { __html: '' };
  let f = escapeHtml(text);
  f = f.replace(/\*([\s\S]*?)\*/g, '<strong>$1</strong>');
  f = f.replace(/_([\s\S]*?)_/g, '<em>$1</em>');
  f = f.replace(/~([\s\S]*?)~/g, '<del>$1</del>');
  f = f.replace(/\n/g, '<br/>');
  return { __html: f };
};

export default function ChatView({
  conversation, messages, onSendMessage, onSendMedia, onDeleteMessage, onDeleteChat,
  onReactToMessage, onOpenTemplate, onBack, onUpdateContact, onConversationUpdate, messagesLoading
}) {
  const [input, setInput] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const prevConvIdRef = useRef(null);

  // Status & Labels
  const [convStatus, setConvStatus] = useState('open');
  const [labels, setLabels] = useState([]);
  const [labelInput, setLabelInput] = useState('');
  const [addingLabel, setAddingLabel] = useState(false);

  // Notes
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState([]);
  const [noteInput, setNoteInput] = useState('');

  // Reminder
  const [reminder, setReminder] = useState(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNote, setReminderNote] = useState('');

  // Quick replies
  const [quickReplies, setQuickReplies] = useState([]);
  const [showQR, setShowQR] = useState(false);

  // Media
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaPreview, setMediaPreview] = useState(null);

  // Message context menu & reaction picker
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [reactionPickerForMsgId, setReactionPickerForMsgId] = useState(null);
  const longPressTimer = useRef(null);

  // Reply
  const [replyingTo, setReplyingTo] = useState(null); // { id, content, direction, wamid }
  const msgSwipeRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!messagesEndRef.current || !messages.length) return;
    const isNewConv = conversation?.id !== prevConvIdRef.current;
    prevConvIdRef.current = conversation?.id ?? null;
    messagesEndRef.current.scrollIntoView({ behavior: isNewConv ? 'instant' : 'smooth' });
  }, [messages, conversation?.id]);

  useEffect(() => {
    if (!activeMenuId && reactionPickerForMsgId === null) return;
    const close = () => { setActiveMenuId(null); setReactionPickerForMsgId(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [activeMenuId, reactionPickerForMsgId]);

  useEffect(() => {
    api.getQuickReplies().then(setQuickReplies).catch(() => {});
  }, []);

  useEffect(() => {
    if (!conversation) return;
    api.markAsRead(conversation.id).catch(() => {});
    setConvStatus(conversation.status || 'open');
    setLabels(Array.isArray(conversation.labels) ? conversation.labels : []);
    setNotesOpen(false);
    setNotes([]);
    setNoteInput('');
    setReminder(null);
    setShowReminderModal(false);
    setShowQR(false);
    setShowProfile(false);
    setReplyingTo(null);
    api.getNotes(conversation.id).then(setNotes).catch(() => {});
    api.getReminder(conversation.id).then(setReminder).catch(() => setReminder(null));
  }, [conversation?.id]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim(), replyingTo?.wamid || null);
    setInput('');
    setShowQR(false);
    setReplyingTo(null);
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') { setShowQR(false); setReplyingTo(null); }
  };

  const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts), today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const handleStatusChange = async (newStatus) => {
    const prev = convStatus;
    setConvStatus(newStatus);
    try {
      await api.updateStatus(conversation.id, newStatus);
      onConversationUpdate?.();
    } catch {
      setConvStatus(prev);
      toast.error('Failed to update status');
    }
  };

  const handleAddLabel = async () => {
    const lbl = labelInput.trim();
    if (!lbl || labels.includes(lbl)) { setAddingLabel(false); setLabelInput(''); return; }
    const newLabels = [...labels, lbl];
    setLabels(newLabels); setAddingLabel(false); setLabelInput('');
    try { await api.updateLabels(conversation.id, newLabels); onConversationUpdate?.(); }
    catch { toast.error('Failed to update labels'); setLabels(labels); }
  };
  const handleRemoveLabel = async (lbl) => {
    const newLabels = labels.filter(l => l !== lbl);
    setLabels(newLabels);
    try { await api.updateLabels(conversation.id, newLabels); onConversationUpdate?.(); }
    catch { toast.error('Failed to update labels'); setLabels(labels); }
  };

  const handleAddNote = async () => {
    if (!noteInput.trim()) return;
    try {
      const note = await api.createNote(conversation.id, noteInput.trim());
      setNotes(prev => [...prev, note]); setNoteInput('');
    } catch { toast.error('Failed to add note'); }
  };
  const handleDeleteNote = async (noteId) => {
    try {
      await api.deleteNote(conversation.id, noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch { toast.error('Failed to delete note'); }
  };

  const handleSetReminder = async () => {
    if (!reminderDate) return;
    try {
      const r = await api.setReminder(conversation.id, reminderDate, reminderNote || null);
      setReminder(r); setShowReminderModal(false);
      toast.success('Reminder set!'); onConversationUpdate?.();
    } catch { toast.error('Failed to set reminder'); }
  };
  const handleClearReminder = async () => {
    try {
      await api.clearReminder(conversation.id);
      setReminder(null); onConversationUpdate?.();
      toast.success('Reminder cleared');
    } catch { toast.error('Failed to clear reminder'); }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('video') ? 'video' : 'image';
    setMediaPreview({ file, url, type, caption: '' });
    e.target.value = '';
  };

  const handleMediaSend = async () => {
    if (!mediaPreview || !onSendMedia) return;
    const { file, url, type, caption } = mediaPreview;
    URL.revokeObjectURL(url);
    setMediaPreview(null);
    setUploadingMedia(true);
    try {
      const { upload_url, download_url } = await api.presignUpload(file.name, file.type);
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      await onSendMedia(conversation.contact.phone, type, download_url, caption);
    } catch { toast.error('Failed to upload media'); }
    finally { setUploadingMedia(false); }
  };

  const handleSaveName = () => {
    if (editNameValue.trim() && editNameValue !== conversation.contact.name) {
      api.updateContactName(conversation.id, editNameValue.trim()).then(() => {
        onUpdateContact?.(editNameValue.trim());
        setIsEditingName(false);
        toast.success('Contact saved');
      });
    } else setIsEditingName(false);
  };

  const qrFilter = input.startsWith('/') ? input.slice(1).toLowerCase() : '';
  const filteredQR = quickReplies.filter(qr =>
    !input || !input.startsWith('/') || qr.title.toLowerCase().includes(qrFilter) || qr.body.toLowerCase().includes(qrFilter)
  );

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-wa-chat">
        <div className="text-center animate-fade-in">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-wa-input/50 flex items-center justify-center">
            <Send size={32} className="text-wa-green" />
          </div>
          <h2 className="text-xl font-light text-wa-text mb-2">WhatsApp Dashboard</h2>
          <p className="text-sm text-wa-muted">Select a conversation to start messaging</p>
        </div>
      </div>
    );
  }

  let windowOpen = false, remainingText = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].direction === 'inbound') {
      const msSince = new Date() - new Date(messages[i].timestamp);
      const msLeft = 24 * 60 * 60 * 1000 - msSince;
      if (msLeft > 0) {
        windowOpen = true;
        const h = Math.floor(msLeft / 3600000), m = Math.floor((msLeft % 3600000) / 60000);
        remainingText = h > 0 ? `${h}h ${m}m left` : `${m}m left`;
      }
      break;
    }
  }

  let lastDate = '';
  const initials = getInitials(conversation.contact.name);

  return (
    <div
      className="relative flex-1 flex flex-col bg-wa-chat h-full overflow-hidden"
      onTouchStart={(e) => {
        swipeStartX.current = e.touches[0].clientX;
        swipeStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - swipeStartX.current;
        const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY.current);
        if (dx > 80 && dy < 60) {
          if (showProfile) setShowProfile(false);
          else onBack?.();
        }
      }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div className="bg-wa-dark border-b border-wa-border z-10 shrink-0">
        <div className="px-3 py-2.5 flex items-center gap-2">
          {/* Back button — ChevronLeft, mobile only */}
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden p-1 -ml-1.5 rounded-full hover:bg-wa-hover text-wa-text shrink-0 active:bg-wa-hover"
            >
              <ChevronLeft size={26} strokeWidth={2.5} />
            </button>
          )}

          {/* Avatar + name — tappable → opens profile */}
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-10 h-10 shrink-0 rounded-full bg-wa-input flex items-center justify-center text-wa-green font-medium text-[15px] tracking-wide border border-wa-border/50 shadow-sm">
              {initials ? initials : <User size={20} className="text-wa-muted opacity-80" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-wa-text truncate leading-snug">
                {conversation.contact.name || conversation.contact.phone}
              </p>
              <p className="text-xs text-wa-muted leading-snug truncate">
                {labels.length > 0 ? labels.slice(0, 2).join(', ') : conversation.contact.phone}
              </p>
            </div>
          </button>

          {/* Action icons */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => onOpenTemplate?.()}
              className="p-1.5 rounded-full hover:bg-wa-hover transition-colors text-wa-muted"
              title="Send template">
              <LayoutTemplate size={18} />
            </button>
            <button onClick={() => setShowReminderModal(true)}
              className={`p-1.5 rounded-full hover:bg-wa-hover transition-colors ${reminder ? 'text-yellow-400' : 'text-wa-muted'}`}>
              {reminder ? <BellRing size={18} /> : <Bell size={18} />}
            </button>
            <button onClick={() => setNotesOpen(!notesOpen)}
              className={`p-1.5 rounded-full hover:bg-wa-hover transition-colors ${notesOpen ? 'text-wa-green' : 'text-wa-muted'}`}>
              <StickyNote size={18} />
            </button>
            {onDeleteChat && (
              <button onClick={onDeleteChat} className="p-1.5 rounded-full hover:bg-wa-hover text-wa-muted hover:text-red-400 transition-all">
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Messages ───────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 md:px-16 py-4"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
      >
        {messagesLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader size={22} className="animate-spin text-wa-muted" />
          </div>
        ) : null}
        {messages.map((msg) => {
          // Hide legacy reaction rows created before inline reactions were added
          if (msg.message_type === 'reaction') return null;
          const msgDate = formatDate(msg.timestamp);
          const showDateSep = msgDate !== lastDate;
          lastDate = msgDate;
          const reacts = (() => { try { return msg.reactions ? JSON.parse(msg.reactions) : {}; } catch { return {}; } })();
          const hasReacts = Object.keys(reacts).length > 0;
          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="flex justify-center my-3">
                  <span className="bg-wa-incoming text-wa-muted text-xs px-3 py-1 rounded-lg shadow">{msgDate}</span>
                </div>
              )}
              {/* Per-message: long press → context menu; right-swipe → reply */}
              <div
                className={`flex ${hasReacts ? 'mb-3' : 'mb-1'} animate-slide-in select-none md:select-text ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                style={{ touchAction: 'pan-y' }}
                onTouchStart={(e) => {
                  const bubble = e.currentTarget.querySelector('[data-bubble]');
                  const icon = e.currentTarget.querySelector('[data-swipe-icon]');
                  msgSwipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, bubble, icon, triggered: false };
                  longPressTimer.current = setTimeout(() => setActiveMenuId(msg.id), 600);
                }}
                onTouchMove={(e) => {
                  const dx = e.touches[0].clientX - msgSwipeRef.current.x;
                  const dy = Math.abs(e.touches[0].clientY - msgSwipeRef.current.y);
                  if (Math.abs(dx) > 8) clearTimeout(longPressTimer.current);
                  if (dx > 0 && dy < 40) {
                    const offset = Math.min(dx, 80);
                    if (msgSwipeRef.current.bubble) {
                      msgSwipeRef.current.bubble.style.transform = `translateX(${offset}px)`;
                      msgSwipeRef.current.bubble.style.transition = 'none';
                    }
                    if (msgSwipeRef.current.icon) {
                      msgSwipeRef.current.icon.style.opacity = Math.min(offset / 50, 1);
                      msgSwipeRef.current.icon.style.transform = `translateY(-50%) scale(${0.6 + 0.4 * Math.min(offset / 60, 1)})`;
                    }
                    if (offset >= 60 && !msgSwipeRef.current.triggered) {
                      msgSwipeRef.current.triggered = true;
                    }
                  }
                }}
                onTouchEnd={(e) => {
                  clearTimeout(longPressTimer.current);
                  const dx = e.changedTouches[0].clientX - msgSwipeRef.current.x;
                  const dy = Math.abs(e.changedTouches[0].clientY - msgSwipeRef.current.y);
                  if (msgSwipeRef.current.bubble) {
                    msgSwipeRef.current.bubble.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                    msgSwipeRef.current.bubble.style.transform = 'translateX(0)';
                  }
                  if (msgSwipeRef.current.icon) {
                    msgSwipeRef.current.icon.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                    msgSwipeRef.current.icon.style.opacity = '0';
                    msgSwipeRef.current.icon.style.transform = 'translateY(-50%) scale(0.6)';
                  }
                  if (dx > 60 && dy < 50) {
                    setReplyingTo({ id: msg.id, content: msg.content, direction: msg.direction, wamid: msg.wamid });
                    e.stopPropagation();
                  }
                }}
              >
                <div className="relative group/msg max-w-[72%]" data-bubble data-wamid={msg.wamid}>
                  {/* Swipe-to-reply hint icon — appears from left as bubble slides right */}
                  <div data-swipe-icon
                    className="absolute right-full top-1/2 pr-2 pointer-events-none"
                    style={{ opacity: 0, transform: 'translateY(-50%) scale(0.6)' }}>
                    <div className="w-7 h-7 rounded-full bg-wa-input/90 border border-wa-border flex items-center justify-center shadow">
                      <CornerUpLeft size={13} className="text-wa-muted" />
                    </div>
                  </div>
                  {/* Desktop reaction picker — inline above bubble */}
                  {reactionPickerForMsgId === msg.id && (
                    <div
                      className={`hidden md:flex items-center gap-1 mb-1.5 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1 bg-wa-dark border border-wa-border rounded-full px-2.5 py-1.5 shadow-2xl">
                        {REACTION_EMOJIS.map(emoji => (
                          <button key={emoji}
                            onClick={() => { onReactToMessage?.(msg.id, emoji); setReactionPickerForMsgId(null); }}
                            className={`text-xl hover:scale-125 transition-transform rounded-full px-0.5 py-0 ${reacts[emoji] === 'outbound' ? 'bg-wa-green/25' : ''}`}>
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={`px-3 py-2 rounded-lg shadow-sm ${msg.direction === 'outbound' ? 'bg-wa-outgoing rounded-tr-none' : 'bg-wa-incoming rounded-tl-none'}`}>
                    {msg.reply_to_wamid && (() => {
                      const quoted = messages.find(m => m.wamid === msg.reply_to_wamid);
                      return (
                        <div
                          className="border-l-[3px] border-wa-green/70 bg-black/20 rounded-sm px-2 py-1 mb-2 cursor-pointer active:opacity-70"
                          onClick={() => {
                            const el = document.querySelector(`[data-wamid="${msg.reply_to_wamid}"]`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.style.transition = 'box-shadow 0.2s';
                              el.style.boxShadow = '0 0 0 2px rgba(0,168,132,0.6)';
                              el.style.borderRadius = '8px';
                              setTimeout(() => { el.style.boxShadow = ''; el.style.borderRadius = ''; }, 1200);
                            }
                          }}
                        >
                          <p className="text-[10px] text-wa-green/80 font-medium mb-0.5">
                            {quoted?.direction === 'inbound' ? (conversation.contact.name || conversation.contact.phone) : 'You'}
                          </p>
                          <p className="text-[11px] text-wa-muted truncate">
                            {quoted ? (quoted.content?.substring(0, 80) || '📎 Media') : '↩ Replied to a message'}
                          </p>
                        </div>
                      );
                    })()}
                    {msg.message_type === 'template' && (
                      <span className="text-[10px] text-wa-green/70 font-medium block mb-1">📋 TEMPLATE</span>
                    )}
                    <p className="text-sm text-wa-text whitespace-pre-wrap break-words mt-1">
                      {msg.content?.startsWith('[Image Attachment]') ? (
                        <>
                          <img src={msg.content.split('\n')[1]} alt="Attachment"
                            className="w-full max-h-60 object-cover rounded mb-2 border border-wa-border/50 bg-black/20"
                            onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }} />
                          <div style={{display:'none'}} className="text-[11px] text-red-400 p-2 bg-red-900/10 border border-red-900/30 rounded mb-2">
                            Image couldn't be loaded.
                          </div>
                          <span dangerouslySetInnerHTML={formatWhatsAppText(msg.content.split('\n').slice(2).join('\n'))} />
                        </>
                      ) : <span dangerouslySetInnerHTML={formatWhatsAppText(msg.content)} />}
                    </p>
                    <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                      <span className="text-[11px] text-wa-muted">{formatTime(msg.timestamp)}</span>
                      {msg.direction === 'outbound' && <StatusIcon status={msg.status} />}
                    </div>
                    {msg.status === 'failed' && msg.error_message && (
                      <div className="text-[10px] text-red-400 mt-1.5 px-1 py-1 bg-black/20 rounded border border-red-900/40">
                        Error: {msg.error_message}
                      </div>
                    )}
                  </div>

                  {/* Reaction pills — below bubble, slightly overlapping */}
                  {hasReacts && (
                    <div className={`flex gap-1 flex-wrap -mb-2 mt-0.5 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      {Object.entries(reacts).map(([emoji, sender]) => (
                        <button key={emoji}
                          onClick={(e) => { e.stopPropagation(); onReactToMessage?.(msg.id, emoji); }}
                          className={`text-sm rounded-full px-1.5 py-0.5 border flex items-center gap-0.5 transition-colors shadow-sm
                            ${sender === 'outbound' ? 'bg-wa-green/15 border-wa-green/40 text-wa-green' : 'bg-wa-input border-wa-border'}`}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Desktop hover actions: Reply + Smile (reactions) + ChevronDown (delete) */}
                  <div className={`hidden md:flex items-center gap-0.5 absolute top-1 ${msg.direction === 'outbound' ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} opacity-0 group-hover/msg:opacity-100 transition-opacity`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setReplyingTo({ id: msg.id, content: msg.content, direction: msg.direction, wamid: msg.wamid }); }}
                      className="p-0.5 text-wa-muted hover:text-wa-text rounded transition-colors"
                      title="Reply"
                    >
                      <CornerUpLeft size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setReactionPickerForMsgId(id => id === msg.id ? null : msg.id); setActiveMenuId(null); }}
                      className="p-0.5 text-wa-muted hover:text-wa-text rounded transition-colors"
                    >
                      <Smile size={14} />
                    </button>
                    {onDeleteMessage && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(id => id === msg.id ? null : msg.id); setReactionPickerForMsgId(null); }}
                        className="p-0.5 text-wa-muted hover:text-wa-text rounded transition-colors"
                      >
                        <ChevronDown size={14} />
                      </button>
                    )}
                  </div>

                  {/* Desktop dropdown */}
                  {activeMenuId === msg.id && (
                    <div
                      className={`hidden md:block absolute top-8 z-20 bg-wa-dark border border-wa-border rounded-lg shadow-xl min-w-[110px] ${msg.direction === 'outbound' ? 'right-0' : 'left-0'}`}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={() => { onDeleteMessage(msg.id); setActiveMenuId(null); }}
                        className="flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-wa-hover/80 w-full transition-colors rounded-lg"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Mobile bottom-sheet context menu */}
      {activeMenuId && (() => {
        const activeMsg = messages.find(m => m.id === activeMenuId);
        const activeReacts = (() => { try { return activeMsg?.reactions ? JSON.parse(activeMsg.reactions) : {}; } catch { return {}; } })();
        return (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setActiveMenuId(null)}>
            <div className="absolute inset-0 bg-black/40" />
            <div className="relative bg-wa-dark border-t border-wa-border rounded-t-2xl pb-8 shadow-2xl animate-slide-in" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-wa-border rounded-full mx-auto mt-3 mb-1" />
              {/* Reply */}
              <button
                onClick={() => {
                  const m = messages.find(m => m.id === activeMenuId);
                  if (m) setReplyingTo({ id: m.id, content: m.content, direction: m.direction, wamid: m.wamid });
                  setActiveMenuId(null);
                }}
                className="flex items-center gap-3 px-6 py-3 text-wa-text hover:bg-wa-hover/50 w-full transition-colors text-base border-b border-wa-border"
              >
                <CornerUpLeft size={20} className="text-wa-muted" /> Reply
              </button>
              {/* Reaction emoji row */}
              <div className="flex justify-around px-4 py-3 border-b border-wa-border">
                {REACTION_EMOJIS.map(emoji => (
                  <button key={emoji}
                    onClick={() => { onReactToMessage?.(activeMenuId, emoji); setActiveMenuId(null); }}
                    className={`text-[26px] transition-transform active:scale-90 rounded-full p-1 ${activeReacts[emoji] === 'outbound' ? 'bg-wa-green/25 ring-1 ring-wa-green/40' : ''}`}>
                    {emoji}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { onDeleteMessage(activeMenuId); setActiveMenuId(null); }}
                className="flex items-center gap-3 px-6 py-4 text-red-400 hover:bg-wa-hover/50 w-full transition-colors text-base font-medium"
              >
                <Trash2 size={20} /> Delete message
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Input ──────────────────────────────────────── */}
      {!windowOpen ? (
        <div className="px-4 py-3 bg-wa-dark border-t border-wa-border">
          <div className="bg-wa-input/50 border border-wa-border px-4 py-3 rounded-lg flex items-start gap-3 w-full">
            <AlertCircle size={18} className="text-wa-muted shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <p className="text-[13px] text-wa-muted font-medium">Customer Service Window Closed</p>
              <p className="text-[12px] text-wa-muted/80">Meta requires an active 24-hour window. Use a Template to re-open.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 bg-wa-dark border-t border-wa-border flex flex-col gap-2">
          <div className="text-[11px] text-wa-green/80 px-2 flex items-center gap-1.5 font-medium ml-1">
            <Clock size={12} />
            24-hour window active ({remainingText})
          </div>
          {replyingTo && (
            <div className="bg-wa-input/60 border border-wa-border rounded-lg px-3 py-2 flex items-start gap-2">
              <div className="w-[3px] self-stretch bg-wa-green rounded-full shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-wa-green font-semibold mb-0.5">
                  {replyingTo.direction === 'outbound' ? 'You' : (conversation.contact.name || conversation.contact.phone)}
                </p>
                <p className="text-xs text-wa-muted truncate">{replyingTo.content?.substring(0, 80) || '📎 Media'}</p>
              </div>
              <button onClick={() => setReplyingTo(null)} className="text-wa-muted hover:text-wa-text shrink-0 p-0.5 -mt-0.5">
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelect} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingMedia}
              className="p-2 rounded-full hover:bg-wa-hover text-wa-muted hover:text-wa-text transition-colors shrink-0"
              title="Send media"
            >
              {uploadingMedia ? <Loader size={20} className="animate-spin text-wa-green" /> : <Paperclip size={20} />}
            </button>

            <div className="relative flex-1">
              {(showQR || input.startsWith('/')) && filteredQR.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-wa-dark border border-wa-border rounded-xl shadow-xl max-h-48 overflow-y-auto z-20">
                  <div className="px-3 py-1.5 text-[10px] text-wa-muted font-medium uppercase tracking-wide border-b border-wa-border">
                    Quick Replies
                  </div>
                  {filteredQR.map(qr => (
                    <button key={qr.id} onClick={() => { setInput(qr.body); setShowQR(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-wa-hover transition-colors border-b border-wa-border/50 last:border-b-0">
                      <div className="text-xs font-medium text-wa-green">{qr.title}</div>
                      <div className="text-xs text-wa-muted truncate mt-0.5">{qr.body}</div>
                    </button>
                  ))}
                </div>
              )}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="w-full bg-wa-input text-wa-text rounded-lg px-4 py-2.5 text-sm outline-none resize-none placeholder:text-wa-muted focus:ring-1 focus:ring-wa-green/30 transition-all max-h-32"
                style={{ minHeight: '42px' }}
              />
            </div>

            <button onClick={() => setShowQR(!showQR)}
              className={`p-2 rounded-full hover:bg-wa-hover transition-colors shrink-0 ${showQR ? 'text-wa-green' : 'text-wa-muted'}`}
              title="Quick replies">
              <Zap size={20} />
            </button>

            <button onClick={handleSend} disabled={!input.trim()}
              className="p-2.5 rounded-full bg-wa-green hover:bg-wa-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0">
              <Send size={18} className="text-wa-darker" />
            </button>
          </div>
        </div>
      )}

      {/* ── Media Preview Modal ────────────────────────── */}
      {mediaPreview && (
        <div className="absolute inset-0 bg-black/80 z-30 flex items-center justify-center p-4">
          <div className="bg-wa-dark border border-wa-border rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-wa-border flex items-center justify-between">
              <span className="text-sm font-semibold text-wa-text">Send {mediaPreview.type === 'video' ? 'Video' : 'Image'}</span>
              <button onClick={() => { URL.revokeObjectURL(mediaPreview.url); setMediaPreview(null); }} className="text-wa-muted hover:text-wa-text p-1">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {mediaPreview.type === 'image'
                ? <img src={mediaPreview.url} alt="Preview" className="w-full max-h-64 object-contain rounded-lg bg-black/30" />
                : <video src={mediaPreview.url} className="w-full max-h-64 rounded-lg bg-black/30" controls />}
              <input type="text" value={mediaPreview.caption}
                onChange={e => setMediaPreview(prev => ({ ...prev, caption: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleMediaSend();
                  if (e.key === 'Escape') { URL.revokeObjectURL(mediaPreview.url); setMediaPreview(null); }
                }}
                placeholder="Add a caption (optional)..." autoFocus
                className="w-full bg-wa-input border border-wa-border text-wa-text text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-wa-green/30 placeholder:text-wa-muted"
              />
              <button onClick={handleMediaSend}
                className="w-full bg-wa-green text-wa-darker py-2 rounded-lg text-sm font-semibold hover:bg-wa-green/90 transition-colors flex items-center justify-center gap-2">
                <Send size={15} /> Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile Panel ──────────────────────────────── */}
      {showProfile && (
        <div className="absolute inset-0 z-30 bg-wa-dark flex flex-col animate-slide-in-right">
          {/* Profile header */}
          <div className="bg-wa-dark border-b border-wa-border px-3 py-2.5 flex items-center gap-2 shrink-0">
            <button onClick={() => setShowProfile(false)} className="p-1 -ml-1 rounded-full hover:bg-wa-hover text-wa-text active:bg-wa-hover">
              <ChevronLeft size={26} strokeWidth={2.5} />
            </button>
            <span className="text-[15px] font-semibold text-wa-text">Contact Info</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Avatar + name */}
            <div className="flex flex-col items-center pt-8 pb-6 px-6 border-b border-wa-border">
              <div className="w-20 h-20 rounded-full bg-wa-input flex items-center justify-center text-wa-green font-medium text-3xl border border-wa-border/50 shadow mb-3">
                {initials ? initials : <User size={36} className="text-wa-muted opacity-80" />}
              </div>
              {isEditingName ? (
                <form onSubmit={(e) => { e.preventDefault(); handleSaveName(); }} className="flex items-center gap-2 mt-1">
                  <input type="text" value={editNameValue} onChange={e => setEditNameValue(e.target.value)}
                    className="bg-wa-input rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-wa-green/50 text-wa-text border border-wa-border text-base w-48"
                    autoFocus onBlur={() => setTimeout(handleSaveName, 150)} />
                  <button type="submit" className="text-wa-green p-1"><Check size={18} /></button>
                </form>
              ) : (
                <button onClick={() => { setEditNameValue(conversation.contact.name || ''); setIsEditingName(true); }}
                  className="flex items-center gap-2 mt-1 group">
                  <span className="text-xl font-semibold text-wa-text">
                    {conversation.contact.name || 'Unsaved Contact'}
                  </span>
                  <Edit2 size={14} className="text-wa-muted group-hover:text-wa-green transition-colors" />
                </button>
              )}
              <p className="text-sm text-wa-muted mt-2">{conversation.contact.phone}</p>
            </div>

            {/* Status */}
            <div className="px-5 py-5 border-b border-wa-border">
              <p className="text-xs text-wa-muted font-semibold uppercase tracking-wider mb-3">Conversation Status</p>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map(s => (
                  <button key={s.value} onClick={() => handleStatusChange(s.value)}
                    className={`text-sm px-4 py-1.5 rounded-full border font-medium transition-colors ${convStatus === s.value ? s.active : s.inactive}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Labels */}
            <div className="px-5 py-5 border-b border-wa-border">
              <p className="text-xs text-wa-muted font-semibold uppercase tracking-wider mb-3">Labels</p>
              <div className="flex flex-wrap gap-2">
                {labels.map(lbl => (
                  <span key={lbl} className="flex items-center gap-1 text-sm bg-wa-green/15 text-wa-green border border-wa-green/20 px-2.5 py-1 rounded-full">
                    {lbl}
                    <button onClick={() => handleRemoveLabel(lbl)} className="hover:text-red-400 ml-0.5"><X size={10} /></button>
                  </span>
                ))}
                {addingLabel ? (
                  <input type="text" value={labelInput} onChange={e => setLabelInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddLabel(); if (e.key === 'Escape') { setAddingLabel(false); setLabelInput(''); } }}
                    onBlur={handleAddLabel}
                    className="text-sm bg-wa-input border border-wa-green/30 rounded-full px-3 py-1 outline-none text-wa-text w-28"
                    placeholder="Add label..." autoFocus />
                ) : (
                  <button onClick={() => setAddingLabel(true)}
                    className="flex items-center gap-1.5 text-sm text-wa-muted hover:text-wa-green transition-colors border border-wa-border rounded-full px-3 py-1">
                    <Plus size={13} /> Add label
                  </button>
                )}
              </div>
            </div>

            {/* Danger zone */}
            {onDeleteChat && (
              <div className="px-5 py-5">
                <button onClick={() => { setShowProfile(false); onDeleteChat(); }}
                  className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm transition-colors">
                  <Trash2 size={16} /> Delete conversation
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Notes Panel ────────────────────────────────── */}
      <div className={`absolute inset-y-0 right-0 w-72 bg-wa-dark border-l border-wa-border flex flex-col z-10 transition-transform duration-200 shadow-2xl ${notesOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="px-4 py-3 border-b border-wa-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <StickyNote size={16} className="text-wa-green" />
            <span className="text-sm font-semibold text-wa-text">Notes</span>
            {notes.length > 0 && <span className="text-xs text-wa-muted">({notes.length})</span>}
          </div>
          <button onClick={() => setNotesOpen(false)} className="text-wa-muted hover:text-wa-text p-1"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {notes.length === 0 && <p className="text-xs text-wa-muted text-center py-4">No notes yet</p>}
          {notes.map(note => (
            <div key={note.id} className="bg-wa-input/50 border border-wa-border rounded-lg p-2.5 group">
              <p className="text-xs text-wa-text whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-wa-muted">{new Date(note.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <button onClick={() => handleDeleteNote(note.id)} className="text-wa-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-wa-border shrink-0">
          <textarea value={noteInput} onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAddNote(); }}
            placeholder="Add a note... (Ctrl+Enter)" rows={2}
            className="w-full bg-wa-input text-wa-text text-xs rounded-lg px-3 py-2 outline-none resize-none placeholder:text-wa-muted focus:ring-1 focus:ring-wa-green/30"
          />
          <button onClick={handleAddNote} disabled={!noteInput.trim()}
            className="mt-2 w-full bg-wa-green text-wa-darker text-xs py-1.5 rounded-lg font-semibold disabled:opacity-40 hover:bg-wa-green/90 transition-colors">
            Add Note
          </button>
        </div>
      </div>

      {/* ── Reminder Modal ─────────────────────────────── */}
      {showReminderModal && (
        <div className="absolute inset-0 bg-black/60 z-20 flex items-center justify-center p-4">
          <div className="bg-wa-dark border border-wa-border rounded-xl w-full max-w-sm shadow-2xl">
            <div className="px-4 py-3 border-b border-wa-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-wa-green" />
                <span className="text-sm font-semibold text-wa-text">Follow-up Reminder</span>
              </div>
              <button onClick={() => setShowReminderModal(false)} className="text-wa-muted hover:text-wa-text"><X size={16} /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {reminder && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 text-xs text-yellow-400">
                  Current: {new Date(reminder.remind_at).toLocaleString()}
                  {reminder.note && <div className="mt-1 text-wa-muted">{reminder.note}</div>}
                </div>
              )}
              <div>
                <label className="text-xs text-wa-muted block mb-1">Remind at</label>
                <input type="datetime-local" value={reminderDate} onChange={e => setReminderDate(e.target.value)}
                  className="w-full bg-wa-input border border-wa-border text-wa-text text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-wa-green/30" />
              </div>
              <div>
                <label className="text-xs text-wa-muted block mb-1">Note (optional)</label>
                <input type="text" value={reminderNote} onChange={e => setReminderNote(e.target.value)}
                  placeholder="e.g. Follow up on order"
                  className="w-full bg-wa-input border border-wa-border text-wa-text text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-wa-green/30" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSetReminder} disabled={!reminderDate}
                  className="flex-1 bg-wa-green text-wa-darker py-2 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-wa-green/90 transition-colors">
                  Set Reminder
                </button>
                {reminder && (
                  <button onClick={handleClearReminder}
                    className="px-4 bg-red-500/20 text-red-400 border border-red-500/30 py-2 rounded-lg text-sm hover:bg-red-500/30 transition-colors">
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
