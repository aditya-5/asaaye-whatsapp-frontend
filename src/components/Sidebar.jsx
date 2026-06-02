import { useState, useEffect, useRef } from 'react';
import { Search, MessageSquarePlus, User } from 'lucide-react';
import { api } from '../api';

export function getInitials(name) {
  if (!name) return null;
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return null;
}

export default function Sidebar({ conversations, activeId, onSelect, onNewChat }) {
  const [search, setSearch] = useState('');
  const [filtered, setFiltered] = useState(conversations);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(conversations);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      conversations.filter(
        (c) =>
          c.contact.phone.includes(q) ||
          (c.contact.name && c.contact.name.toLowerCase().includes(q))
      )
    );
  }, [search, conversations]);

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-full h-full bg-wa-sidebar flex flex-col border-r border-wa-border">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-wa-dark border-b border-wa-border">
        <h1 className="text-lg font-semibold text-wa-text flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-wa-green pulse-green inline-block"></span>
          WhatsApp Dashboard
        </h1>
        <button
          onClick={onNewChat}
          className="p-2 rounded-full hover:bg-wa-hover transition-colors"
          title="New Message"
        >
          <MessageSquarePlus size={20} className="text-wa-muted" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-wa-muted" />
          <input
            type="text"
            placeholder="Search or start a new chat"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-wa-input text-wa-text text-sm rounded-lg pl-10 pr-4 py-2 outline-none placeholder:text-wa-muted focus:ring-1 focus:ring-wa-green/30 transition-all"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-wa-muted text-sm py-12">
            No conversations yet
          </div>
        )}
        {filtered.map((conv) => {
          let isActive24 = false;
          if (conv.last_inbound_message_at) {
            const msSince = new Date() - new Date(conv.last_inbound_message_at);
            if (msSince < 24 * 60 * 60 * 1000 && msSince >= 0) isActive24 = true;
          }
          return (
          <div
            key={conv.id}
            onClick={() => onSelect(conv)}
            className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-wa-border/50 border-r-4 ${
              activeId === conv.id
                ? 'bg-wa-hover'
                : 'hover:bg-wa-hover/50'
            } ${isActive24 ? 'border-r-wa-green' : 'border-r-transparent'}`}
          >
            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-wa-input flex items-center justify-center flex-shrink-0 text-wa-green font-medium text-[17px] tracking-wide border border-wa-border/50 shadow-sm">
              {(() => {
                const initials = getInitials(conv.contact.name);
                return initials ? initials : <User size={24} className="text-wa-muted opacity-80" />;
              })()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-wa-text text-[15px] truncate">
                  {conv.contact.name || conv.contact.phone}
                </span>
                <span className="text-xs text-wa-muted flex-shrink-0 ml-2">
                  {formatTime(conv.last_message_at)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-sm text-wa-muted truncate">
                  {conv.last_message?.content || 'No messages yet'}
                </span>
                {conv.unread_count > 0 && (
                  <span className="bg-wa-green text-wa-darker text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 ml-2">
                    {conv.unread_count}
                  </span>
                )}
              </div>
            </div>
          </div>
        )})}
      </div>
    </div>
  );
}
