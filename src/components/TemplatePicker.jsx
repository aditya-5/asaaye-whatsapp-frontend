import { useState, useEffect } from 'react';
import { X, Send, ChevronDown, Image, FileText, Video, Users, User } from 'lucide-react';
import { api } from '../api';
import toast from 'react-hot-toast';

const formatWhatsAppText = (text) => {
  if (!text) return { __html: '' };
  let formatted = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  formatted = formatted.replace(/\*([\s\S]*?)\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/_([\s\S]*?)_/g, '<em>$1</em>');
  formatted = formatted.replace(/~([\s\S]*?)~/g, '<del>$1</del>');
  formatted = formatted.replace(/\n/g, '<br/>');
  return { __html: formatted };
};

export default function TemplatePicker({ onClose, onSend }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState('single'); // 'single' | 'bulk'

  // Single mode state
  const [phone, setPhone] = useState('');
  const [params, setParams] = useState([]);
  const [mediaUrl, setMediaUrl] = useState('');

  // Bulk mode state
  const [csvData, setCsvData] = useState('');
  const [showBulkPreview, setShowBulkPreview] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkErrors, setBulkErrors] = useState([]);
  const [liveErrors, setLiveErrors] = useState([]);
  
  // Known contacts for autocomplete
  const [knownContacts, setKnownContacts] = useState([]);
  const [notionSuggestions, setNotionSuggestions] = useState([]);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const [previewImageError, setPreviewImageError] = useState(false);

  useEffect(() => {
    api.getConversations().then(c => setKnownContacts(c)).catch(() => {});
  }, []);

  // Search Notion when user types a name
  useEffect(() => {
    if (!phone || phone.length < 2) { setNotionSuggestions([]); return; }
    const timeout = setTimeout(() => {
      api.getNotionContacts('', phone).then(setNotionSuggestions).catch(() => {});
    }, 300);
    return () => clearTimeout(timeout);
  }, [phone]);

  useEffect(() => {
    if (!csvData.trim() || !selected) {
      setLiveErrors([]);
      return;
    }
    const errors = [];
    const rows = csvData.trim().split(/\r?\n/).map(r => r.split(',').map(c => c.trim()));
    const numParams = selected.param_count || 0;
    const hasMedia = selected && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selected.header_format);
    
    rows.forEach((row, i) => {
      if (!row[0]) return;
      const phone = row[0].replace(/\D/g, '');
      if (phone.length < 10) errors.push(`Row ${i+1}: Invalid phone number "${row[0]}"`);
      
      const rowParams = row.slice(1, 1 + numParams);
      if (rowParams.length < numParams || rowParams.some(p => !p.trim())) {
         errors.push(`Row ${i+1}: Missing parameters (Expected ${numParams})`);
      }
      
      if (hasMedia) {
         const tMediaUrl = row[1 + numParams];
         if (!tMediaUrl || !tMediaUrl.trim() || !tMediaUrl.startsWith('http')) {
            errors.push(`Row ${i+1}: Missing or invalid Media URL`);
         }
      }
    });
    setLiveErrors(errors);
  }, [csvData, selected]);

  const handleLoadContacts = async () => {
    try {
      const convs = await api.getConversations();
      const uniquePhones = [...new Set(convs.map(c => c.contact.phone))];
      
      const padding = selected && selected.param_count > 0 
         ? Array(selected.param_count).fill('Param').map((p,i)=>`, ${p}${i+1}`).join('') 
         : '';
      const hasMedia = selected && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selected.header_format);
      const mediaPad = hasMedia ? ', https://example.com/media.jpg' : '';
      
      setCsvData(uniquePhones.map(p => p + padding + mediaPad).join('\n'));
      toast.success(`Loaded ${uniquePhones.length} contacts`);
    } catch {
      toast.error('Failed to load contacts');
    }
  };

  useEffect(() => {
    api.getTemplates()
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSelect = (template) => {
    setSelected(template);
    setParams(Array(template.param_count || 0).fill(''));
    setMediaUrl('');
  };

  const handleSendSingle = async () => {
    if (!phone || !selected) return;
    
    // Prepare data
    const bodyParams = params.filter((p) => p.trim()).map((p) => ({ type: 'text', text: p }));
    const data = { phone, template_name: selected.name, language_code: selected.language, body_params: bodyParams };

    if (selected.header_format === 'IMAGE' && mediaUrl) data.header_image_url = mediaUrl;
    else if (selected.header_format === 'VIDEO' && mediaUrl) data.header_video_url = mediaUrl;
    else if (selected.header_format === 'DOCUMENT' && mediaUrl) data.header_document_url = mediaUrl;

    // Instant UI close
    onClose();

    // Fire in background
    try {
      await onSend(data);
    } catch (e) {
      console.error(e);
    }
  };

  const validateBulk = () => {
    if (!csvData.trim() || !selected) return;
    
    // Support both literal \n and real newlines
    const rows = csvData.trim().split(/\r?\n/).map(r => r.split(',').map(c => c.trim()));
    const validRows = [];
    const errors = [];
    
    const numParams = selected.param_count || 0;
    const hasMedia = selected && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selected.header_format);

    rows.forEach((row, i) => {
      if (!row[0]) return;
      
      const phone = row[0].replace(/\D/g, '');
      if (phone.length < 10) {
        errors.push(`Row ${i+1}: Invalid phone number "${row[0]}"`);
        return;
      }
      
      // Check params
      const rowParams = row.slice(1, 1 + numParams);
      if (rowParams.length < numParams) {
        errors.push(`Row ${i+1}: Missing parameters (Expected ${numParams})`);
        return;
      }
      
      // Check media if required
      const tMediaUrl = row[1 + numParams] || '';
      if (hasMedia && (!tMediaUrl || !tMediaUrl.trim() || !tMediaUrl.startsWith('http'))) {
        errors.push(`Row ${i+1}: Missing or invalid Media URL`);
        return;
      }
      
      validRows.push({
        phone: phone,
        params: rowParams,
        mediaUrl: tMediaUrl
      });
    });
    
    setBulkRows(validRows);
    setBulkErrors(errors);
    setPreviewImageError(false);
    setShowBulkPreview(true);
  };

  const handleSendBulk = () => {
    onClose(); // Instant close!
    
    toast.promise(
      (async () => {
        let sentCount = 0;
        let failCount = 0;

        for (const row of bulkRows) {
          const bodyParams = row.params.map(p => ({ type: 'text', text: p }));
          const data = { 
            phone: row.phone, 
            template_name: selected.name, 
            language_code: selected.language, 
            body_params: bodyParams 
          };
          
          if (selected.header_format === 'IMAGE' && row.mediaUrl) data.header_image_url = row.mediaUrl;
          else if (selected.header_format === 'VIDEO' && row.mediaUrl) data.header_video_url = row.mediaUrl;
          else if (selected.header_format === 'DOCUMENT' && row.mediaUrl) data.header_document_url = row.mediaUrl;

          try {
            await onSend(data);
            sentCount++;
          } catch (e) {
            failCount++;
          }
        }
        
        if (failCount > 0) {
          throw new Error(`Complete: ${sentCount} sent, ${failCount} failed`);
        }
        return `Successfully sent to ${sentCount} contacts`;
      })(),
      {
        loading: `Sending ${bulkRows.length} messages...`,
        success: (msg) => msg,
        error: (err) => err.message
      }
    );
  };

  const HeaderIcon = ({ format }) => {
    switch (format) {
      case 'IMAGE': return <Image size={14} className="text-wa-green" />;
      case 'VIDEO': return <Video size={14} className="text-wa-green" />;
      case 'DOCUMENT': return <FileText size={14} className="text-wa-green" />;
      default: return null;
    }
  };

  const getBodyText = (template) => {
    const body = template.components?.find(c => c.type === 'BODY');
    return body?.text || '';
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
      <div className="bg-wa-dark rounded-xl w-full max-w-2xl mx-4 shadow-2xl border border-wa-border max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-wa-border">
          <h2 className="text-lg font-semibold text-wa-text">Send Template Message</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-wa-hover transition-colors">
            <X size={20} className="text-wa-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col md:flex-row gap-6">
          
          {/* Left Column: Templates */}
          <div className="w-full md:w-1/2 flex flex-col">
            <label className="text-sm font-medium text-wa-text block mb-2">1. Select Template</label>
            {loading ? (
              <div className="text-wa-muted text-sm py-4">Loading templates...</div>
            ) : (
              <div className="space-y-2 overflow-y-auto flex-1 pr-2">
                {templates.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleSelect(t)}
                    className={`p-3 rounded-lg cursor-pointer border transition-all ${
                      selected?.id === t.id
                        ? 'border-wa-green bg-wa-green/10'
                        : 'border-wa-border hover:border-wa-muted/50 bg-wa-input/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-wa-text">{t.name}</span>
                      <div className="flex items-center gap-2">
                        {t.header_format && <HeaderIcon format={t.header_format} />}
                        <span className="text-xs text-wa-muted">{t.language}</span>
                      </div>
                    </div>
                    <p className="text-xs text-wa-muted mt-1 whitespace-pre-wrap">{getBodyText(t)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Configuration */}
          <div className="w-full md:w-1/2 flex flex-col pt-4 md:pt-0 border-t md:border-t-0 md:border-l border-wa-border md:pl-6">
            <div className="flex bg-wa-input p-1 rounded-lg mb-4">
              <button
                onClick={() => setMode('single')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-sm rounded-md transition-all ${mode === 'single' ? 'bg-wa-dark text-wa-text shadow' : 'text-wa-muted hover:text-wa-text'}`}
              >
                <User size={14} /> Single
              </button>
              <button
                onClick={() => setMode('bulk')}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-sm rounded-md transition-all ${mode === 'bulk' ? 'bg-wa-green text-wa-darker shadow font-medium' : 'text-wa-muted hover:text-wa-text'}`}
              >
                <Users size={14} /> Bulk (CSV)
              </button>
            </div>

            {mode === 'single' ? (
              <div className="space-y-4 pr-2 pb-32">
                <div className="relative">
                  <label className="text-sm text-wa-muted block mb-1">Phone Number / Select Contact</label>
                  <input 
                    type="text" 
                    value={phone} 
                    onChange={(e) => {
                       setPhone(e.target.value);
                       setShowPhoneSuggestions(true);
                    }} 
                    onFocus={() => setShowPhoneSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowPhoneSuggestions(false), 200)}
                    placeholder="Search name or type number..." 
                    className="w-full bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-wa-green/30" 
                  />
                  {showPhoneSuggestions && phone.length > 0 && (() => {
                    const convMatches = knownContacts.filter(c =>
                      c.contact.phone.includes(phone) || (c.contact.name && c.contact.name.toLowerCase().includes(phone.toLowerCase()))
                    );
                    // Notion results not already in conversations
                    const convPhones = new Set(knownContacts.map(c => c.contact.phone));
                    const notionMatches = notionSuggestions.filter(n => !convPhones.has(n.phone));
                    const total = convMatches.length + notionMatches.length;
                    if (total === 0) return null;
                    return (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-wa-dark border border-wa-border rounded-lg shadow-xl max-h-52 overflow-y-auto z-10">
                        {convMatches.length > 0 && (
                          <>
                            <div className="px-3 py-1 text-[10px] text-wa-muted font-medium uppercase tracking-wide border-b border-wa-border/50 bg-wa-input/30">Recent chats</div>
                            {convMatches.map(c => (
                              <div key={c.id} className="px-3 py-2 cursor-pointer hover:bg-wa-hover text-sm text-wa-text border-b border-wa-border/30 last:border-0"
                                onClick={() => { setPhone(c.contact.phone); setShowPhoneSuggestions(false); }}>
                                <div className="font-medium">{c.contact.name || 'Unsaved Contact'}</div>
                                <div className="text-xs text-wa-muted">{c.contact.phone}</div>
                              </div>
                            ))}
                          </>
                        )}
                        {notionMatches.length > 0 && (
                          <>
                            <div className="px-3 py-1 text-[10px] text-wa-muted font-medium uppercase tracking-wide border-b border-wa-border/50 bg-wa-input/30">Notion contacts</div>
                            {notionMatches.map(n => (
                              <div key={n.phone} className="px-3 py-2 cursor-pointer hover:bg-wa-hover text-sm text-wa-text border-b border-wa-border/30 last:border-0"
                                onClick={() => { setPhone(n.phone); setShowPhoneSuggestions(false); }}>
                                <div className="font-medium">{n.name || 'Unknown'}</div>
                                <div className="text-xs text-wa-muted">{n.phone}</div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {selected?.header_format && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selected.header_format) && (
                  <div>
                    <label className="text-sm text-wa-muted block mb-1">{selected.header_format} URL</label>
                    <input type="url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." className="w-full bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-wa-green/30" />
                  </div>
                )}
                {selected && selected.param_count > 0 && (
                  <div>
                    <label className="text-sm text-wa-muted block mb-1">Parameters ({selected.param_count})</label>
                    {params.map((p, i) => (
                      <input key={i} type="text" value={p} onChange={(e) => { const n = [...params]; n[i] = e.target.value; setParams(n); }} placeholder={`Param {{${i + 1}}}`} className="w-full bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2 outline-none mb-2 focus:ring-1 focus:ring-wa-green/30" />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm text-wa-muted font-medium">Paste CSV Data (No Headers)</label>
                  <button onClick={handleLoadContacts} className="text-xs text-wa-green hover:underline flex items-center gap-1">
                    <Users size={12}/> Load Saved Contacts
                  </button>
                </div>
                <div className="text-[11px] text-wa-muted mb-2 p-2 bg-wa-input/50 rounded flex flex-col gap-1">
                  Format per line (comma separated):
                  <span className="text-wa-green font-mono">
                    Phone{selected?.param_count > 0 ? `, Param1...Param${selected.param_count}` : ''}{selected && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selected.header_format) ? ', Media_URL' : ''}
                  </span>
                  Example: <span className="text-wa-text font-mono">447775458618{selected?.param_count > 0 ? ', John' : ''}{selected && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selected.header_format) ? ', https://link.jpg' : ''}</span>
                </div>
                {liveErrors.length > 0 && (
                  <div className="text-[11px] text-red-400 bg-red-400/10 p-2 rounded mb-2 border border-red-400/20 max-h-24 overflow-y-auto">
                    {liveErrors.length} validation errors found. Please correct them before sending.
                  </div>
                )}
                <textarea
                  value={csvData}
                  onChange={(e) => setCsvData(e.target.value)}
                  placeholder="447775458618, John, https://example.com/img.jpg&#10;1234567890, Jane, https://example.com/img2.jpg"
                  className="w-full flex-1 min-h-[160px] bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2 outline-none resize-y placeholder:text-wa-muted/40 focus:ring-1 focus:ring-wa-green/30 font-mono"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-wa-border flex justify-end">
          <button
            onClick={mode === 'single' ? handleSendSingle : validateBulk}
            disabled={(!selected) || (mode === 'single' && !phone) || (mode === 'bulk' && !csvData.trim()) || sending}
            className="w-full bg-wa-green hover:bg-wa-green/90 text-wa-darker font-semibold py-2.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Send size={16} />
            {sending ? 'Sending...' : mode === 'bulk' ? 'Preview Bulk Send' : 'Send Template'}
          </button>
        </div>
      </div>

      {/* Bulk Preview Modal */}
      {showBulkPreview && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-wa-dark w-full max-w-xl rounded-xl border border-wa-border shadow-2xl flex flex-col max-h-[80vh]">
            <div className="px-5 py-4 border-b border-wa-border flex justify-between items-center">
              <h3 className="font-semibold text-wa-text">Bulk Summary: {selected.name}</h3>
              <button onClick={() => setShowBulkPreview(false)}><X size={20} className="text-wa-muted"/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-wa-input p-3 rounded-lg border border-wa-border text-center">
                  <div className="text-2xl font-bold text-wa-green">{bulkRows.length}</div>
                  <div className="text-xs text-wa-muted">Ready to Send</div>
                </div>
                <div className="bg-wa-input p-3 rounded-lg border border-wa-border text-center">
                  <div className="text-2xl font-bold text-red-400">{bulkErrors.length}</div>
                  <div className="text-xs text-wa-muted">Errors found</div>
                </div>
              </div>

              {bulkErrors.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Errors</h4>
                  <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
                    {bulkErrors.map((err, i) => (
                      <p key={i} className="text-xs text-red-400">• {err}</p>
                    ))}
                  </div>
                </div>
              )}

              <h4 className="text-xs font-semibold text-wa-muted uppercase tracking-wider mb-2">Message Preview</h4>
              <div className="bg-wa-incoming/50 rounded-lg p-3 border border-wa-border whitespace-pre-wrap">
                {selected.header_format === 'IMAGE' && bulkRows[0]?.mediaUrl && (
                  <div className="relative">
                    <img 
                      src={bulkRows[0].mediaUrl} 
                      onError={() => setPreviewImageError(true)} 
                      onLoad={() => setPreviewImageError(false)}
                      className={`w-full max-h-40 object-cover rounded mb-2 border border-wa-border/50 bg-black/20 ${previewImageError ? 'hidden' : 'block'}`} 
                      alt="Preview"
                    />
                    {previewImageError && (
                      <div className="text-[11px] text-red-400 p-2 bg-red-900/10 border border-red-900/30 rounded mb-2">
                        The image URL couldn't be loaded. Send disabled.
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[13px] text-wa-text font-normal mt-1 leading-relaxed">
                  <span dangerouslySetInnerHTML={formatWhatsAppText(
                    getBodyText(selected).replace(/\{\{(\d+)\}\}/g, (match, d) => {
                      const idx = parseInt(d) - 1;
                      return bulkRows[0]?.params[idx] || match;
                    })
                  )} />
                </p>
                {selected.header_format && selected.header_format !== 'IMAGE' && bulkRows[0]?.mediaUrl && (
                  <div className="mt-2 text-[10px] text-wa-green flex items-center gap-1">
                    <FileText size={10}/> With {selected.header_format.toLowerCase()} attachment
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-wa-border bg-wa-dark/50 flex gap-3">
              <button 
                onClick={() => setShowBulkPreview(false)}
                className="flex-1 py-2 text-wa-text hover:bg-wa-hover rounded-lg transition-colors border border-wa-border"
              >
                Go Back
              </button>
              <button 
                onClick={handleSendBulk}
                disabled={bulkRows.length === 0 || sending || bulkErrors.length > 0 || previewImageError}
                className="flex-[2] py-2 bg-wa-green text-wa-darker font-bold rounded-lg hover:bg-wa-green/90 transition-all disabled:opacity-40"
              >
                {sending ? 'Sending...' : `Confirm Send`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
