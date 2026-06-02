import { useState, useEffect, useRef } from 'react';
import { Send, User, Check, CheckCheck, Clock, AlertCircle, Trash2, ArrowLeft, Edit2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../api';
import { getInitials } from './Sidebar';

function StatusIcon({ status }) {
  switch (status) {
    case 'sent':
      return <Check size={14} className="text-wa-muted" />;
    case 'delivered':
      return <CheckCheck size={14} className="text-wa-muted" />;
    case 'read':
      return <CheckCheck size={14} className="text-wa-blue" />;
    case 'failed':
      return <AlertCircle size={14} className="text-red-400" />;
    default:
      return <Clock size={14} className="text-wa-muted" />;
  }
}

const escapeHtml = (text) => {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const formatWhatsAppText = (text) => {
  if (!text) return { __html: '' };
  let formatted = escapeHtml(text);
  formatted = formatted.replace(/\*([\s\S]*?)\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/_([\s\S]*?)_/g, '<em>$1</em>');
  formatted = formatted.replace(/~([\s\S]*?)~/g, '<del>$1</del>');
  formatted = formatted.replace(/\n/g, '<br/>');
  return { __html: formatted };
};

export default function ChatView({ conversation, messages, onSendMessage, onDeleteMessage, onDeleteChat, onBack, onUpdateContact }) {
  const [input, setInput] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Mark as read when viewing
    if (conversation && conversation.unread_count > 0) {
      api.markAsRead(conversation.id).catch(() => {});
    }
  }, [conversation]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

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

  // Group messages by date
  let lastDate = '';

  // Calculate 24-hour window
  let windowOpen = false;
  let remainingText = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].direction === 'inbound') {
      const msSince = new Date() - new Date(messages[i].timestamp);
      const msLeft = (24 * 60 * 60 * 1000) - msSince;
      if (msLeft > 0) {
        windowOpen = true;
        const hrsLeft = Math.floor(msLeft / (60 * 60 * 1000));
        const minsLeft = Math.floor((msLeft % (60 * 60 * 1000)) / (60 * 1000));
        remainingText = hrsLeft > 0 ? `${hrsLeft}h ${minsLeft}m left` : `${minsLeft}m left`;
      }
      break;
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-wa-chat h-full">
      {/* Chat Header */}
      <div className="px-4 py-3 bg-wa-dark border-b border-wa-border flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="md:hidden p-2 -ml-2 rounded-full hover:bg-wa-hover text-wa-muted">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="w-10 h-10 shrink-0 rounded-full bg-wa-input flex items-center justify-center text-wa-green font-medium text-[15px] tracking-wide border border-wa-border/50 shadow-sm">
          {(() => {
            const initials = getInitials(conversation.contact.name);
            return initials ? initials : <User size={20} className="text-wa-muted opacity-80" />;
          })()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-medium text-wa-text flex items-center gap-2">
            {isEditingName ? (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editNameValue.trim() && editNameValue !== conversation.contact.name) {
                    api.updateContactName(conversation.id, editNameValue.trim()).then(() => {
                      if (onUpdateContact) onUpdateContact(editNameValue.trim());
                      setIsEditingName(false);
                      toast.success('Contact saved');
                    });
                  } else {
                    setIsEditingName(false);
                  }
                }}
                className="flex items-center gap-1"
              >
                <input 
                  type="text" 
                  value={editNameValue} 
                  onChange={e => setEditNameValue(e.target.value)} 
                  className="bg-wa-input rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-wa-green/50 text-wa-text border border-wa-border w-full max-w-[150px]" 
                  autoFocus 
                  onBlur={() => setTimeout(() => setIsEditingName(false), 200)}
                />
                <button type="submit" className="text-wa-green hover:opacity-80 p-1">
                  <Check size={16} />
                </button>
              </form>
            ) : (
              <>
                <span className="truncate">{conversation.contact.name || "Unsaved Contact"}</span>
                <button 
                  onClick={() => {
                    setEditNameValue(conversation.contact.name || "");
                    setIsEditingName(true);
                  }}
                  className="text-wa-muted hover:text-wa-green transition-colors"
                >
                  <Edit2 size={12} />
                </button>
              </>
            )}
          </h3>
          <p className="text-xs text-wa-muted truncate">{conversation.contact.phone}</p>
        </div>
        
        {onDeleteChat && (
          <button 
            onClick={onDeleteChat}
            className="p-2 rounded-full hover:bg-wa-hover text-wa-muted hover:text-red-400 transition-all"
            title="Delete this chat"
          >
            <Trash2 size={20} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-16 py-4" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
        {messages.map((msg, i) => {
          const msgDate = formatDate(msg.timestamp);
          const showDateSep = msgDate !== lastDate;
          lastDate = msgDate;

          return (
            <div key={msg.id}>
              {showDateSep && (
                <div className="flex justify-center my-3">
                  <span className="bg-wa-incoming text-wa-muted text-xs px-3 py-1 rounded-lg shadow">
                    {msgDate}
                  </span>
                </div>
              )}
              <div
                className={`flex mb-1 animate-slide-in ${
                  msg.direction === 'outbound' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[65%] px-3 py-2 rounded-lg shadow-sm relative ${
                    msg.direction === 'outbound'
                      ? 'bg-wa-outgoing rounded-tr-none'
                      : 'bg-wa-incoming rounded-tl-none'
                  }`}
                >
                  {msg.message_type === 'template' && (
                    <span className="text-[10px] text-wa-green/70 font-medium block mb-1">
                      📋 TEMPLATE
                    </span>
                  )}
                  <p className="text-sm text-wa-text whitespace-pre-wrap break-words mt-1">
                    {msg.content?.startsWith('[Image Attachment]') ? (
                      <>
                        <img 
                          src={msg.content.split('\n')[1]} 
                          alt="Attachment" 
                          className="w-full max-h-60 object-cover rounded mb-2 border border-wa-border/50 bg-black/20"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'block';
                          }}
                        />
                        <div style={{display: 'none'}} className="text-[11px] text-red-400 p-2 bg-red-900/10 border border-red-900/30 rounded mb-2">
                          The image URL couldn't be loaded. Please check.
                        </div>
                        <span dangerouslySetInnerHTML={formatWhatsAppText(msg.content.split('\n').slice(2).join('\n'))} />
                      </>
                    ) : (
                      <span dangerouslySetInnerHTML={formatWhatsAppText(msg.content)} />
                    )}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-1 opacity-70 group-hover:opacity-100 transition-opacity">
                    <span className="text-[11px] text-wa-muted">{formatTime(msg.timestamp)}</span>
                    {msg.direction === 'outbound' && <StatusIcon status={msg.status} />}
                    {onDeleteMessage && (
                      <button 
                        onClick={() => onDeleteMessage(msg.id)}
                        className={`ml-1 transition-colors ${msg.status === 'failed' ? 'text-red-500 hover:text-red-400' : 'text-wa-muted hover:text-red-400'}`}
                        title={msg.status === 'failed' ? (msg.error_message || "Message failed") : "Delete message"}
                      >
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
        <div className="px-4 py-3 bg-wa-dark border-t border-wa-border flex flex-col items-center justify-center">
          <div className="bg-wa-input/50 border border-wa-border px-4 py-3 rounded-lg flex items-start gap-3 w-full">
            <AlertCircle size={18} className="text-wa-muted shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 items-start">
              <p className="text-[13px] text-wa-muted text-left font-medium">
                Customer Service Window Closed
              </p>
              <p className="text-[12px] text-wa-muted/80 text-left">
                Meta requires an active 24-hour window to send free-form messages. This window only opens when the customer replies to you. 
                Initiate a new chat using an approved <strong>Template</strong> to re-open the window once they reply.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 bg-wa-dark border-t border-wa-border flex flex-col gap-2">
          {windowOpen && (
            <div className="text-[11px] text-wa-green/80 px-2 flex items-center gap-1.5 font-medium ml-1 animate-fade-in group relative cursor-help">
              <Clock size={12} />
              24-hour window active ({remainingText})
              <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-wa-input p-2 rounded shadow-xl border border-wa-border text-[10px] w-64 text-wa-muted z-50">
                 WhatsApp allows free-form messages within 24 hours of the last inbound message from the user.
              </div>
            </div>
          )}
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 bg-wa-input text-wa-text rounded-lg px-4 py-2.5 text-sm outline-none resize-none placeholder:text-wa-muted focus:ring-1 focus:ring-wa-green/30 transition-all max-h-32"
              style={{ minHeight: '42px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2.5 rounded-full bg-wa-green hover:bg-wa-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send size={18} className="text-wa-darker" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
