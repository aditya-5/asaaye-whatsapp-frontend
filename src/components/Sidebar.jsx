import { useState, useEffect } from 'react';
import { Search, MessageSquarePlus, User, Bell, Loader } from 'lucide-react';

export function getInitials(name) {
  if (!name) return null;
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return null;
}

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'closed', label: 'Closed' },
];

export default function Sidebar({ conversations, activeId, loading, onSelect, onNewChat }) {
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('');
  const [filtered, setFiltered] = useState(conversations);

  useEffect(() => {
    let list = conversations;
    if (statusTab) list = list.filter(c => (c.status || 'open') === statusTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.contact.phone.includes(q) || (c.contact.name && c.contact.name.toLowerCase().includes(q)));
    }
    setFiltered(list);
  }, [search, conversations, statusTab]);

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        <button onClick={onNewChat} className="p-2 rounded-full hover:bg-wa-hover transition-colors" title="New Message">
          <MessageSquarePlus size={20} className="text-wa-muted" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-2">
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

      {/* Status tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-wa-border">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setStatusTab(tab.value)}
            className={`flex-1 text-xs py-1 rounded-lg font-medium transition-colors ${
              statusTab === tab.value ? 'bg-wa-green text-wa-darker' : 'text-wa-muted hover:text-wa-text hover:bg-wa-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {loading && filtered.length === 0 && (
          <div className="flex justify-center py-12">
            <Loader size={22} className="text-wa-muted animate-spin" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center text-wa-muted text-sm py-12">No conversations</div>
        )}
        {filtered.map((conv) => {
          let isActive24 = false;
          if (conv.last_inbound_message_at) {
            const msSince = new Date() - new Date(conv.last_inbound_message_at);
            if (msSince < 24 * 60 * 60 * 1000 && msSince >= 0) isActive24 = true;
          }
          const convStatus = conv.status || 'open';
          const statusDot = convStatus === 'pending' ? 'bg-yellow-400' : convStatus === 'closed' ? 'bg-wa-muted' : null;

          return (
            <div
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-b border-wa-border/50 border-r-4 ${
                activeId === conv.id ? 'bg-wa-hover' : 'hover:bg-wa-hover/50'
              } ${isActive24 ? 'border-r-wa-green' : 'border-r-transparent'}`}
            >
              {/* Avatar with status dot */}
              <div className="relative w-12 h-12 shrink-0">
                <div className="w-12 h-12 rounded-full bg-wa-input flex items-center justify-center text-wa-green font-medium text-[17px] tracking-wide border border-wa-border/50 shadow-sm">
                  {(() => { const i = getInitials(conv.contact.name); return i ? i : <User size={24} className="text-wa-muted opacity-80" />; })()}
                </div>
                {statusDot && (
                  <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ${statusDot} border-2 border-wa-sidebar`} />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-wa-text text-[15px] truncate">
                    {conv.contact.name || conv.contact.phone}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {conv.has_reminder && (
                      <Bell size={11} className="text-yellow-400" />
                    )}
                    <span className="text-xs text-wa-muted">{formatTime(conv.last_message_at)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-sm text-wa-muted truncate">
                    {conv.last_message?.content?.startsWith('[Image Attachment]')
                      ? '📎 Image'
                      : conv.last_message?.content || 'No messages yet'}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="bg-wa-green text-wa-darker text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 ml-2">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
                {conv.labels && conv.labels.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {conv.labels.slice(0, 2).map(lbl => (
                      <span key={lbl} className="text-[9px] bg-wa-green/10 text-wa-green border border-wa-green/20 px-1 rounded-full">{lbl}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
