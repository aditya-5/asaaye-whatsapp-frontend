import { useState, useEffect } from 'react';
import { X, Zap, CheckCircle, XCircle, Loader } from 'lucide-react';
import { api } from '../api';
import { toast } from 'react-hot-toast';

export default function BulkBlastModal({ contacts, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
  const [contactList, setContactList] = useState(contacts);

  useEffect(() => {
    api.getTemplates().then(data => {
      const approved = data.filter(t => t.status === 'APPROVED');
      setTemplates(approved);
      if (approved.length > 0) setSelectedTemplate(approved[0]);
    }).catch(() => {});
  }, []);

  const removeContact = (phone) => {
    setContactList(prev => prev.filter(c => c.phone !== phone));
  };

  const handleBlast = async () => {
    if (!selectedTemplate || contactList.length === 0) return;
    setSending(true);
    try {
      const res = await api.blastTemplate({
        phones: contactList.map(c => c.phone),
        template_name: selectedTemplate.name,
        language_code: selectedTemplate.language || 'en',
      });
      setResults(res);
      toast.success(`Sent to ${res.sent}/${res.total} contacts`);
    } catch (e) {
      toast.error('Blast failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-wa-dark border border-wa-border rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-wa-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-wa-green" />
            <h2 className="text-wa-text font-semibold">Bulk Blast</h2>
            <span className="text-xs text-wa-muted bg-wa-input px-2 py-0.5 rounded-full">
              {contactList.length} contacts
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-wa-hover text-wa-muted">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Template picker */}
          {!results && (
            <div>
              <label className="text-xs text-wa-muted font-medium uppercase tracking-wide block mb-2">
                Template
              </label>
              <select
                value={selectedTemplate?.name || ''}
                onChange={e => setSelectedTemplate(templates.find(t => t.name === e.target.value))}
                className="w-full bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2 outline-none border border-wa-border focus:ring-1 focus:ring-wa-green/30"
              >
                {templates.length === 0 && <option>No approved templates</option>}
                {templates.map(t => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Contact list / results */}
          <div>
            <label className="text-xs text-wa-muted font-medium uppercase tracking-wide block mb-2">
              {results ? 'Results' : 'Recipients'}
            </label>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {results ? (
                results.results.map(r => (
                  <div key={r.phone} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-wa-input/30">
                    {r.status === 'sent'
                      ? <CheckCircle size={14} className="text-wa-green shrink-0" />
                      : <XCircle size={14} className="text-red-400 shrink-0" />
                    }
                    <span className="text-sm text-wa-text flex-1">{r.phone}</span>
                    {r.error && <span className="text-xs text-red-400 truncate max-w-[120px]">{r.error}</span>}
                  </div>
                ))
              ) : (
                contactList.map(c => (
                  <div key={c.phone} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-wa-hover/50">
                    <span className="text-sm text-wa-text flex-1 truncate">{c.name || c.phone}</span>
                    <span className="text-xs text-wa-muted">{c.phone}</span>
                    <button
                      onClick={() => removeContact(c.phone)}
                      className="text-wa-muted hover:text-red-400 transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {results && (
            <div className="flex gap-3 text-sm text-center">
              <div className="flex-1 bg-wa-green/10 border border-wa-green/20 rounded-lg py-2">
                <div className="text-wa-green font-bold text-lg">{results.sent}</div>
                <div className="text-wa-muted text-xs">Sent</div>
              </div>
              <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-lg py-2">
                <div className="text-red-400 font-bold text-lg">{results.failed}</div>
                <div className="text-wa-muted text-xs">Failed</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-wa-border">
          {results ? (
            <button
              onClick={onClose}
              className="w-full bg-wa-input text-wa-text py-2.5 rounded-lg font-semibold text-sm hover:bg-wa-hover transition-colors"
            >
              Done
            </button>
          ) : (
            <button
              onClick={handleBlast}
              disabled={sending || contactList.length === 0 || !selectedTemplate}
              className="w-full flex items-center justify-center gap-2 bg-wa-green text-wa-darker py-2.5 rounded-lg font-semibold text-sm hover:bg-wa-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? <Loader size={16} className="animate-spin" /> : <Zap size={16} />}
              {sending ? 'Sending...' : `Send to ${contactList.length} contacts`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
