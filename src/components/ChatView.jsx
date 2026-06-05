import { useState, useEffect, useRef } from 'react';
import {
  Send, User, Check, CheckCheck, Clock, AlertCircle, Trash2, ArrowLeft, Edit2,
  StickyNote, Bell, BellRing, Paperclip, Zap, X, Plus, Loader
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../api';
import { getInitials } from './Sidebar';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', color: 'text-wa-green' },
  { value: 'pending', label: 'Pending', color: 'text-yellow-400' },
  { value: 'closed', label: 'Closed', color: 'text-wa-muted' },
];

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
  onBack, onUpdateContact, onConversationUpdate
}) {
  const [input, setInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    api.getNotes(conversation.id).then(setNotes).catch(() => {});
    api.getReminder(conversation.id).then(setReminder).catch(() => setReminder(null));
  }, [conversation?.id]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
    setShowQR(false);
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') setShowQR(false);
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

  // Status
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

  // Labels
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

  // Notes
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

  // Reminder
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

  // Media upload
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !onSendMedia) return;
    setUploadingMedia(true);
    try {
      const { upload_url, download_url } = await api.presignUpload(file.name, file.type);
      await fetch(upload_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      const mediaType = file.type.startsWith('video') ? 'video' : 'image';
      await onSendMedia(conversation.contact.phone, mediaType, download_url);
      toast.success('Media sent!');
    } catch { toast.error('Failed to upload media'); }
    finally { setUploadingMedia(false); e.target.value = ''; }
  };

  // Quick replies filtering
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

  // 24-hour window
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
  const statusOpt = STATUS_OPTIONS.find(s => s.value === convStatus) || STATUS_OPTIONS[0];

  return (
    <div className="relative flex-1 flex flex-col bg-wa-chat h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-wa-dark border-b border-wa-border flex items-center gap-3 z-10">
        {onBack && (
          <button onClick={onBack} className="md:hidden p-2 -ml-2 rounded-full hover:bg-wa-hover text-wa-muted">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="w-10 h-10 shrink-0 rounded-full bg-wa-input flex items-center justify-center text-wa-green font-medium text-[15px] tracking-wide border border-wa-border/50 shadow-sm">
          {(() => { const i = getInitials(conversation.contact.name); return i ? i : <User size={20} className="text-wa-muted opacity-80" />; })()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-medium text-wa-text flex items-center gap-2">
            {isEditingName ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                if (editNameValue.trim() && editNameValue !== conversation.contact.name) {
                  api.updateContactName(conversation.id, editNameValue.trim()).then(() => {
                    onUpdateContact?.(editNameValue.trim()); setIsEditingName(false); toast.success('Contact saved');
                  });
                } else setIsEditingName(false);
              }} className="flex items-center gap-1">
                <input type="text" value={editNameValue} onChange={e => setEditNameValue(e.target.value)}
                  className="bg-wa-input rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-wa-green/50 text-wa-text border border-wa-border w-full max-w-[150px]"
                  autoFocus onBlur={() => setTimeout(() => setIsEditingName(false), 200)} />
                <button type="submit" className="text-wa-green hover:opacity-80 p-1"><Check size={16} /></button>
              </form>
            ) : (
              <>
                <span className="truncate">{conversation.contact.name || 'Unsaved Contact'}</span>
                <button onClick={() => { setEditNameValue(conversation.contact.name || ''); setIsEditingName(true); }}
                  className="text-wa-muted hover:text-wa-green transition-colors"><Edit2 size={12} /></button>
              </>
            )}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-xs text-wa-muted">{conversation.contact.phone}</span>
            {labels.map(lbl => (
              <span key={lbl} className="flex items-center gap-0.5 text-[10px] bg-wa-green/15 text-wa-green border border-wa-green/20 px-1.5 py-0.5 rounded-full">
                {lbl}
                <button onClick={() => handleRemoveLabel(lbl)} className="hover:text-red-400 ml-0.5"><X size={8} /></button>
              </span>
            ))}
            {addingLabel ? (
              <input type="text" value={labelInput} onChange={e => setLabelInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddLabel(); if (e.key === 'Escape') { setAddingLabel(false); setLabelInput(''); } }}
                onBlur={handleAddLabel}
                className="text-[10px] bg-wa-input border border-wa-green/30 rounded-full px-2 py-0.5 outline-none text-wa-text w-20"
                placeholder="Add label..." autoFocus />
            ) : (
              <button onClick={() => setAddingLabel(true)} className="text-[10px] text-wa-muted hover:text-wa-green transition-colors">
                <Plus size={10} />
              </button>
            )}
          </div>
        </div>

        {/* Status select */}
        <select
          value={convStatus}
          onChange={e => handleStatusChange(e.target.value)}
          className={`text-xs bg-wa-input border border-wa-border rounded-lg px-2 py-1 outline-none ${statusOpt.color} cursor-pointer shrink-0`}
        >
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {/* Reminder bell */}
        <button
          onClick={() => setShowReminderModal(true)}
          className={`p-1.5 rounded-full hover:bg-wa-hover transition-colors shrink-0 ${reminder ? 'text-yellow-400' : 'text-wa-muted'}`}
          title={reminder ? `Reminder: ${new Date(reminder.remind_at).toLocaleString()}` : 'Set reminder'}
        >
          {reminder ? <BellRing size={18} /> : <Bell size={18} />}
        </button>

        {/* Notes toggle */}
        <button
          onClick={() => setNotesOpen(!notesOpen)}
          className={`p-1.5 rounded-full hover:bg-wa-hover transition-colors shrink-0 ${notesOpen ? 'text-wa-green' : 'text-wa-muted'}`}
          title="Notes"
        >
          <StickyNote size={18} />
          {notes.length > 0 && <span className="sr-only">{notes.length}</span>}
        </button>

        {onDeleteChat && (
          <button onClick={onDeleteChat} className="p-2 rounded-full hover:bg-wa-hover text-wa-muted hover:text-red-400 transition-all shrink-0" title="Delete chat">
            <Trash2 size={20} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-16 py-4"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
      >
        {messages.map((msg) => {
          const msgDate = formatDate(msg.timestamp);
          const showDateSep = msgDate !== lastDate;
          lastDate = msgDate;
          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="flex justify-center my-3">
                  <span className="bg-wa-incoming text-wa-muted text-xs px-3 py-1 rounded-lg shadow">{msgDate}</span>
                </div>
              )}
              <div className={`flex mb-1 animate-slide-in ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[65%] px-3 py-2 rounded-lg shadow-sm relative ${msg.direction === 'outbound' ? 'bg-wa-outgoing rounded-tr-none' : 'bg-wa-incoming rounded-tl-none'}`}>
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
                    {onDeleteMessage && (
                      <button onClick={() => onDeleteMessage(msg.id)}
                        className={`ml-1 transition-colors ${msg.status === 'failed' ? 'text-red-500 hover:text-red-400' : 'text-wa-muted hover:text-red-400'}`}
                        title={msg.status === 'failed' ? (msg.error_message || 'Failed') : 'Delete'}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {msg.status === 'failed' && msg.error_message && (
                    <div className="text-[10px] text-red-400 mt-1.5 px-1 py-1 bg-black/20 rounded border border-red-900/40">
                      Error: {msg.error_message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
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
          <div className="flex items-end gap-2">
            {/* Media upload */}
            <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelect} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingMedia}
              className="p-2 rounded-full hover:bg-wa-hover text-wa-muted hover:text-wa-text transition-colors shrink-0"
              title="Send media"
            >
              {uploadingMedia ? <Loader size={20} className="animate-spin text-wa-green" /> : <Paperclip size={20} />}
            </button>

            {/* Quick replies + textarea */}
            <div className="relative flex-1">
              {(showQR || input.startsWith('/')) && filteredQR.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-wa-dark border border-wa-border rounded-xl shadow-xl max-h-48 overflow-y-auto z-20">
                  <div className="px-3 py-1.5 text-[10px] text-wa-muted font-medium uppercase tracking-wide border-b border-wa-border">
                    Quick Replies
                  </div>
                  {filteredQR.map(qr => (
                    <button
                      key={qr.id}
                      onClick={() => { setInput(qr.body); setShowQR(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-wa-hover transition-colors border-b border-wa-border/50 last:border-b-0"
                    >
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
                placeholder="Type a message... (/ for quick replies)"
                rows={1}
                className="w-full bg-wa-input text-wa-text rounded-lg px-4 py-2.5 text-sm outline-none resize-none placeholder:text-wa-muted focus:ring-1 focus:ring-wa-green/30 transition-all max-h-32"
                style={{ minHeight: '42px' }}
              />
            </div>

            {/* Quick replies toggle */}
            <button
              onClick={() => setShowQR(!showQR)}
              className={`p-2 rounded-full hover:bg-wa-hover transition-colors shrink-0 ${showQR ? 'text-wa-green' : 'text-wa-muted'}`}
              title="Quick replies"
            >
              <Zap size={20} />
            </button>

            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2.5 rounded-full bg-wa-green hover:bg-wa-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
            >
              <Send size={18} className="text-wa-darker" />
            </button>
          </div>
        </div>
      )}

      {/* Notes Panel */}
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
          <textarea
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAddNote(); }}
            placeholder="Add a note... (Ctrl+Enter)"
            rows={2}
            className="w-full bg-wa-input text-wa-text text-xs rounded-lg px-3 py-2 outline-none resize-none placeholder:text-wa-muted focus:ring-1 focus:ring-wa-green/30"
          />
          <button onClick={handleAddNote} disabled={!noteInput.trim()}
            className="mt-2 w-full bg-wa-green text-wa-darker text-xs py-1.5 rounded-lg font-semibold disabled:opacity-40 hover:bg-wa-green/90 transition-colors">
            Add Note
          </button>
        </div>
      </div>

      {/* Reminder Modal */}
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
                  className="w-full bg-wa-input border border-wa-border text-wa-text text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-wa-green/30"
                />
              </div>
              <div>
                <label className="text-xs text-wa-muted block mb-1">Note (optional)</label>
                <input type="text" value={reminderNote} onChange={e => setReminderNote(e.target.value)}
                  placeholder="e.g. Follow up on order"
                  className="w-full bg-wa-input border border-wa-border text-wa-text text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-wa-green/30"
                />
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
