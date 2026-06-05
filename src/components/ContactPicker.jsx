import { useState, useEffect } from 'react';
import { Search, X, Users, Zap, User, ChevronRight } from 'lucide-react';
import { api } from '../api';

const SEGMENTS = [
  'All', 'Customer', 'Female', 'Male',
  'Exhibition-Kanpur', 'Exhibition-Mumbai', 'Exhibition-Jaipur', 'Exhibition-Lucknow',
  'Family/Friends',
];

const STATUS_COLORS = {
  'New': 'bg-gray-500',
  'Replied': 'bg-blue-500',
  'In Consultation': 'bg-yellow-500',
  'Converted': 'bg-green-500',
  'Cold': 'bg-orange-700',
  'Opted Out': 'bg-red-600',
};

export default function ContactPicker({ onClose, onSelectSingle, onSelectMultiple }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    load();
  }, [segment]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getNotionContacts(segment === 'All' ? '' : segment, '');
      setContacts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const filtered = search
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search)
      )
    : contacts;

  const toggleSelect = (phone) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(phone) ? next.delete(phone) : next.add(phone);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(c => c.phone)));
    }
  };

  const handleSingleChat = (contact) => {
    onSelectSingle(contact);
    onClose();
  };

  const handleBlast = () => {
    const selectedContacts = contacts.filter(c => selected.has(c.phone));
    onSelectMultiple(selectedContacts);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-wa-dark border border-wa-border rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-wa-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-wa-green" />
            <h2 className="text-wa-text font-semibold">Notion Contacts</h2>
            <span className="text-xs text-wa-muted bg-wa-input px-2 py-0.5 rounded-full">
              {contacts.length}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-wa-hover text-wa-muted">
            <X size={18} />
          </button>
        </div>

        {/* Segment filter */}
        <div className="px-3 py-2 border-b border-wa-border flex gap-1.5 overflow-x-auto scrollbar-none">
          {SEGMENTS.map(s => (
            <button
              key={s}
              onClick={() => { setSegment(s); setSelected(new Set()); }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                segment === s
                  ? 'bg-wa-green text-wa-darker'
                  : 'bg-wa-input text-wa-muted hover:text-wa-text'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-wa-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-wa-muted" />
            <input
              type="text"
              placeholder="Search name or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-wa-input text-wa-text text-sm rounded-lg pl-8 pr-4 py-1.5 outline-none placeholder:text-wa-muted focus:ring-1 focus:ring-wa-green/30"
            />
          </div>
        </div>

        {/* Select all row */}
        {filtered.length > 0 && (
          <div className="px-3 py-1.5 border-b border-wa-border flex items-center justify-between">
            <button
              onClick={selectAll}
              className="text-xs text-wa-muted hover:text-wa-green transition-colors"
            >
              {selected.size === filtered.length && filtered.length > 0 ? 'Deselect all' : `Select all (${filtered.length})`}
            </button>
            {selected.size > 0 && (
              <span className="text-xs text-wa-green font-medium">{selected.size} selected</span>
            )}
          </div>
        )}

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-wa-muted text-sm py-8">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-wa-muted text-sm py-8">No contacts found</div>
          ) : (
            filtered.map((c) => (
              <div
                key={c.phone}
                className={`flex items-center gap-3 px-3 py-2.5 border-b border-wa-border/30 hover:bg-wa-hover/50 transition-colors ${
                  selected.has(c.phone) ? 'bg-wa-green/5' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.phone)}
                  onChange={() => toggleSelect(c.phone)}
                  className="accent-wa-green w-4 h-4 shrink-0"
                />
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => handleSingleChat(c)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-wa-text truncate">{c.name || 'Unknown'}</span>
                    {c.status && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full text-white ${STATUS_COLORS[c.status] || 'bg-gray-600'}`}>
                        {c.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-wa-muted">{c.phone}</span>
                    {c.segments.slice(0, 2).map(seg => (
                      <span key={seg} className="text-[10px] text-wa-muted/60 bg-wa-input px-1 rounded">
                        {seg}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleSingleChat(c)}
                  className="p-1 text-wa-muted hover:text-wa-green transition-colors shrink-0"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer actions */}
        {selected.size > 0 && (
          <div className="px-4 py-3 border-t border-wa-border bg-wa-input/30">
            <button
              onClick={handleBlast}
              className="w-full flex items-center justify-center gap-2 bg-wa-green text-wa-darker py-2.5 rounded-lg font-semibold text-sm hover:bg-wa-green/90 transition-colors"
            >
              <Zap size={16} />
              Blast Template to {selected.size} contact{selected.size !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
