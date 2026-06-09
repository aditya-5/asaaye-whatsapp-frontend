import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Plus, Zap, Loader, CheckCircle, XCircle, Clock,
  Trash2, Send, ExternalLink, ChevronRight, X, ChevronDown,
  Users, FileText, BarChart2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../api';

// ── helpers ────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusPill({ status }) {
  const map = {
    draft: 'bg-wa-input text-wa-muted border-wa-border',
    sending: 'bg-yellow-400/20 text-yellow-400 border-yellow-400/30',
    sent: 'bg-wa-green/15 text-wa-green border-wa-green/30',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${map[status] || map.draft}`}>
      {status}
    </span>
  );
}

function MsgStatusIcon({ status }) {
  if (status === 'sent') return <CheckCircle size={13} className="text-wa-green shrink-0" />;
  if (status === 'failed') return <XCircle size={13} className="text-red-400 shrink-0" />;
  return <Clock size={13} className="text-wa-muted shrink-0" />;
}

// ── Campaign list card ──────────────────────────────────────────────────────

function CampaignCard({ campaign, onSelect, onDelete }) {
  const { stats } = campaign;
  return (
    <div
      className="bg-wa-input border border-wa-border rounded-xl p-4 flex items-start gap-3 hover:border-wa-green/30 transition-colors cursor-pointer"
      onClick={() => onSelect(campaign)}
    >
      <div className="w-9 h-9 shrink-0 rounded-full bg-wa-green/10 flex items-center justify-center">
        <Zap size={16} className="text-wa-green" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-wa-text truncate">{campaign.name}</p>
          <StatusPill status={campaign.status} />
        </div>
        <p className="text-xs text-wa-muted truncate mb-2">
          {campaign.template_name} · {campaign.contact_count} contacts
          {campaign.sent_at && ` · ${fmtDate(campaign.sent_at)}`}
        </p>
        {stats && campaign.status === 'sent' && (
          <div className="flex gap-3 text-xs">
            <span className="text-wa-green">{stats.sent} sent</span>
            {stats.failed > 0 && <span className="text-red-400">{stats.failed} failed</span>}
            {stats.queued > 0 && <span className="text-wa-muted">{stats.queued} queued</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onDelete(campaign.id); }}
          className="p-1.5 rounded-full hover:bg-wa-hover text-wa-muted hover:text-red-400 transition-colors"
        >
          <Trash2 size={15} />
        </button>
        <ChevronRight size={16} className="text-wa-muted" />
      </div>
    </div>
  );
}

// ── Campaign builder modal ──────────────────────────────────────────────────

function BuilderModal({ onClose, onSaved, existingCampaign }) {
  const [step, setStep] = useState(1); // 1=info, 2=contacts+params
  const [name, setName] = useState(existingCampaign?.name || '');
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [contacts, setContacts] = useState([]); // [{phone, name, params:[], media_url}]
  const [saving, setSaving] = useState(false);

  // Contacts search state
  const [notionContacts, setNotionContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [activeSegs, setActiveSegs] = useState([]);
  const [notionLoading, setNotionLoading] = useState(false);

  const SEGMENTS = ['Customer', 'Female', 'Male', 'Exhibition-Kanpur', 'Exhibition-Mumbai',
    'Exhibition-Jaipur', 'Exhibition-Lucknow', 'Family/Friends'];

  useEffect(() => {
    api.getTemplates().then(ts => {
      const approved = ts.filter(t => t.status === 'APPROVED');
      setTemplates(approved);
      if (existingCampaign) {
        const tpl = approved.find(t => t.name === existingCampaign.template_name);
        if (tpl) setSelectedTemplate(tpl);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setNotionLoading(true);
    api.getNotionContacts().then(c => { setNotionContacts(c); setNotionLoading(false); }).catch(() => setNotionLoading(false));
  }, []);

  // Sync contacts from existing campaign
  useEffect(() => {
    if (existingCampaign) {
      // contacts are stored as contact_data in backend; we re-fetch via get_campaign for full detail
      // For now, we only have partial info. Builder will reset contacts on edit.
      setContacts([]);
    }
  }, []);

  const paramCount = selectedTemplate
    ? (selectedTemplate.components?.find(c => c.type === 'BODY')?.text?.match(/\{\{\d+\}\}/g) || []).length
    : 0;
  const hasMedia = selectedTemplate?.header_format && ['IMAGE', 'VIDEO'].includes(selectedTemplate.header_format);
  const colCount = 1 + (hasMedia ? 1 : 0) + paramCount; // name + media? + params

  const getBodyText = (t) => t?.components?.find(c => c.type === 'BODY')?.text || '';

  const filteredNotion = notionContacts.filter(c => {
    const q = contactSearch.toLowerCase();
    const textMatch = !q || c.name?.toLowerCase().includes(q) || c.phone.includes(q);
    const segMatch = activeSegs.length === 0 || activeSegs.every(s => c.segments?.includes(s));
    return textMatch && segMatch;
  });

  const isSelected = (phone) => contacts.some(c => c.phone === phone);

  const toggleContact = (nc) => {
    if (isSelected(nc.phone)) {
      setContacts(prev => prev.filter(c => c.phone !== nc.phone));
    } else {
      setContacts(prev => [...prev, {
        phone: nc.phone,
        name: nc.name || '',
        params: Array(paramCount).fill(''),
        media_url: '',
      }]);
    }
  };

  const updateParam = (phone, idx, val) => {
    setContacts(prev => prev.map(c => c.phone === phone
      ? { ...c, params: c.params.map((p, i) => i === idx ? val : p) }
      : c
    ));
  };
  const updateMedia = (phone, val) => {
    setContacts(prev => prev.map(c => c.phone === phone ? { ...c, media_url: val } : c));
  };

  const applyFirstRowParam = (pi) => {
    const first = contacts[0]?.params[pi]?.trim();
    if (!first) return;
    setContacts(prev => prev.map((c, i) => i === 0 ? c : { ...c, params: c.params.map((p, j) => j === pi ? first : p) }));
  };
  const applyFirstRowMedia = () => {
    const first = contacts[0]?.media_url?.trim();
    if (!first) return;
    setContacts(prev => prev.map((c, i) => i === 0 ? c : { ...c, media_url: first }));
  };

  const handleSave = async () => {
    if (!name.trim() || !selectedTemplate) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        template_name: selectedTemplate.name,
        language_code: selectedTemplate.language || 'en',
        contacts: contacts.map(c => ({
          phone: c.phone,
          name: c.name,
          params: c.params.filter(Boolean),
          media_url: c.media_url || undefined,
        })),
      };
      let saved;
      if (existingCampaign) {
        saved = await api.updateCampaign(existingCampaign.id, payload);
      } else {
        saved = await api.createCampaign(payload);
      }
      onSaved(saved);
      onClose();
      toast.success('Campaign saved');
    } catch (e) {
      toast.error(e.message || 'Failed to save campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center"
      style={{ paddingTop: 'max(0px, env(safe-area-inset-top))', paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
      onClick={onClose}>
      <div
        className="bg-wa-dark border border-wa-border rounded-t-2xl md:rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-wa-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Zap size={17} className="text-wa-green" />
            <h2 className="text-sm font-semibold text-wa-text">
              {existingCampaign ? 'Edit Campaign' : 'New Campaign'}
            </h2>
            <div className="flex gap-1 ml-2">
              {[1, 2].map(s => (
                <div key={s} className={`w-5 h-1 rounded-full ${step >= s ? 'bg-wa-green' : 'bg-wa-border'}`} />
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-wa-hover text-wa-muted"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Step 1: name + template */}
          {step === 1 && (
            <>
              <div>
                <label className="text-xs text-wa-muted font-medium uppercase tracking-wide block mb-1.5">Campaign Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Jaipur Re-engagement June"
                  className="w-full bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2 outline-none border border-wa-border focus:ring-1 focus:ring-wa-green/30"
                />
              </div>
              <div>
                <label className="text-xs text-wa-muted font-medium uppercase tracking-wide block mb-1.5">Template</label>
                <select
                  value={selectedTemplate?.name || ''}
                  onChange={e => setSelectedTemplate(templates.find(t => t.name === e.target.value) || null)}
                  className="w-full bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2 outline-none border border-wa-border focus:ring-1 focus:ring-wa-green/30"
                >
                  <option value="">Select template...</option>
                  {templates.map(t => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
                {selectedTemplate && (
                  <div className="mt-2 px-3 py-2.5 bg-wa-incoming/40 border border-wa-border/50 rounded-lg">
                    {selectedTemplate.header_format && (
                      <p className="text-[10px] text-wa-green mb-1 uppercase tracking-wide font-medium">{selectedTemplate.header_format} header</p>
                    )}
                    <p className="text-[12px] text-wa-text leading-relaxed whitespace-pre-wrap">{getBodyText(selectedTemplate)}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 2: contacts + params */}
          {step === 2 && (
            <>
              {/* Contact picker */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-wa-muted font-medium uppercase tracking-wide">
                    Contacts ({contacts.length} selected)
                  </label>
                </div>
                {/* Segment chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {SEGMENTS.map(s => (
                    <button
                      key={s}
                      onClick={() => setActiveSegs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${activeSegs.includes(s) ? 'bg-wa-green text-wa-darker border-wa-green font-semibold' : 'text-wa-muted border-wa-border hover:border-wa-green/40'}`}
                    >{s}</button>
                  ))}
                </div>
                <input
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  placeholder="Search name or phone..."
                  className="w-full bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2 outline-none border border-wa-border focus:ring-1 focus:ring-wa-green/30 mb-2"
                />
                <div className="max-h-40 overflow-y-auto space-y-0.5 border border-wa-border rounded-lg bg-wa-input/30">
                  {notionLoading && <p className="text-xs text-wa-muted p-3 text-center">Loading...</p>}
                  {!notionLoading && filteredNotion.length === 0 && (
                    <p className="text-xs text-wa-muted p-3 text-center">No contacts</p>
                  )}
                  {filteredNotion.map(nc => (
                    <button
                      key={nc.phone}
                      onClick={() => toggleContact(nc)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-wa-hover/50 transition-colors ${isSelected(nc.phone) ? 'bg-wa-green/10' : ''}`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected(nc.phone) ? 'bg-wa-green border-wa-green' : 'border-wa-border'}`}>
                        {isSelected(nc.phone) && <CheckCircle size={10} className="text-wa-darker" />}
                      </div>
                      <span className="text-sm text-wa-text flex-1 truncate">{nc.name || nc.phone}</span>
                      <span className="text-xs text-wa-muted">{nc.phone}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Params table */}
              {contacts.length > 0 && colCount > 1 && (
                <div>
                  <label className="text-xs text-wa-muted font-medium uppercase tracking-wide block mb-2">Parameters</label>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-wa-input/50">
                          <th className="text-left px-2 py-1.5 text-wa-muted font-medium border border-wa-border/40 min-w-[100px]">Contact</th>
                          {hasMedia && (
                            <th className="text-left px-2 py-1.5 text-wa-muted font-medium border border-wa-border/40 min-w-[140px]">
                              <div className="flex items-center gap-1">
                                Media URL
                                <button onClick={applyFirstRowMedia} className="text-[9px] font-bold text-wa-green border border-wa-green/40 px-1 py-0.5 rounded hover:bg-wa-green/10 disabled:opacity-30 leading-none" disabled={!contacts[0]?.media_url?.trim()}>COMMON</button>
                              </div>
                            </th>
                          )}
                          {Array.from({ length: paramCount }, (_, pi) => (
                            <th key={pi} className="text-left px-2 py-1.5 text-wa-muted font-medium border border-wa-border/40 min-w-[120px]">
                              <div className="flex items-center gap-1">
                                {`{{${pi + 1}}}`}
                                <button onClick={() => applyFirstRowParam(pi)} disabled={!contacts[0]?.params[pi]?.trim()} className="text-[9px] font-bold text-wa-green border border-wa-green/40 px-1 py-0.5 rounded hover:bg-wa-green/10 disabled:opacity-30 disabled:cursor-not-allowed leading-none">COMMON</button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {contacts.map(c => (
                          <tr key={c.phone} className="hover:bg-wa-hover/20">
                            <td className="px-2 py-1 border border-wa-border/40 text-wa-text truncate max-w-[120px]">{c.name || c.phone}</td>
                            {hasMedia && (
                              <td className="px-1 py-1 border border-wa-border/40">
                                <input value={c.media_url || ''} onChange={e => updateMedia(c.phone, e.target.value)} className="w-full bg-transparent text-wa-text outline-none text-[11px] px-1" placeholder="https://..." />
                              </td>
                            )}
                            {Array.from({ length: paramCount }, (_, pi) => (
                              <td key={pi} className="px-1 py-1 border border-wa-border/40">
                                <input value={c.params[pi] || ''} onChange={e => updateParam(c.phone, pi, e.target.value)} className="w-full bg-transparent text-wa-text outline-none text-[11px] px-1" placeholder={`{{${pi + 1}}}`} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-wa-border shrink-0 flex gap-2">
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!name.trim() || !selectedTemplate}
              className="flex-1 bg-wa-green text-wa-darker py-2.5 rounded-lg font-semibold text-sm hover:bg-wa-green/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              Next: Add Contacts <ChevronRight size={16} />
            </button>
          ) : (
            <>
              <button onClick={() => setStep(1)} className="px-4 py-2.5 rounded-lg bg-wa-input text-wa-text text-sm font-semibold hover:bg-wa-hover transition-colors">
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving || contacts.length === 0}
                className="flex-1 bg-wa-green text-wa-darker py-2.5 rounded-lg font-semibold text-sm hover:bg-wa-green/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? <Loader size={15} className="animate-spin" /> : null}
                Save Campaign ({contacts.length} contacts)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Campaign detail view ────────────────────────────────────────────────────

function CampaignDetail({ campaignId, onBack, onUpdated }) {
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const c = await api.getCampaign(campaignId);
      setCampaign(c);
      return c;
    } catch {
      toast.error('Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh while sending
  useEffect(() => {
    if (campaign?.status === 'sending') {
      pollRef.current = setInterval(async () => {
        const c = await load();
        if (c && c.status !== 'sending') clearInterval(pollRef.current);
      }, 3000);
    }
    return () => clearInterval(pollRef.current);
  }, [campaign?.status, load]);

  const handleSend = async () => {
    if (!window.confirm(`Send to ${campaign.contact_count} contacts now?`)) return;
    setSending(true);
    try {
      const updated = await api.sendCampaign(campaign.id);
      setCampaign(updated);
      onUpdated?.();
      toast.success(`Campaign sent to ${updated.stats?.sent} contacts`);
    } catch (e) {
      toast.error(e.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportCampaignToNotion(campaign.id);
      setCampaign(prev => ({ ...prev, notion_exported: true }));
      toast.success('Exported to Notion Activity Log');
    } catch (e) {
      toast.error(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader size={22} className="animate-spin text-wa-muted" />
      </div>
    );
  }
  if (!campaign) return null;

  const { stats } = campaign;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-wa-border flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-full hover:bg-wa-hover text-wa-muted">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-wa-text truncate">{campaign.name}</h2>
            <StatusPill status={campaign.status} />
          </div>
          <p className="text-xs text-wa-muted">{campaign.template_name} · {campaign.contact_count} contacts</p>
        </div>
        {campaign.status === 'draft' && (
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-1.5 bg-wa-green text-wa-darker px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-wa-green/90 disabled:opacity-50"
          >
            {sending ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
            Send
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-wa-input rounded-xl p-3 text-center border border-wa-border">
              <div className="text-lg font-bold text-wa-text">{stats.total}</div>
              <div className="text-[10px] text-wa-muted uppercase tracking-wide">Total</div>
            </div>
            <div className="bg-wa-green/10 rounded-xl p-3 text-center border border-wa-green/20">
              <div className="text-lg font-bold text-wa-green">{stats.sent}</div>
              <div className="text-[10px] text-wa-muted uppercase tracking-wide">Sent</div>
            </div>
            <div className={`rounded-xl p-3 text-center border ${stats.failed > 0 ? 'bg-red-500/10 border-red-500/20' : 'bg-wa-input border-wa-border'}`}>
              <div className={`text-lg font-bold ${stats.failed > 0 ? 'text-red-400' : 'text-wa-muted'}`}>{stats.failed}</div>
              <div className="text-[10px] text-wa-muted uppercase tracking-wide">Failed</div>
            </div>
          </div>
        )}

        {/* Export button */}
        {campaign.status === 'sent' && (
          <button
            onClick={handleExport}
            disabled={exporting || campaign.notion_exported}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold border transition-colors ${campaign.notion_exported ? 'bg-wa-input border-wa-border text-wa-muted cursor-default' : 'bg-wa-input border-wa-green/40 text-wa-green hover:bg-wa-green/10'}`}
          >
            {exporting ? <Loader size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            {campaign.notion_exported ? 'Exported to Notion ✓' : 'Export to Notion Activity Log'}
          </button>
        )}

        {/* Message list */}
        {campaign.messages?.length > 0 && (
          <div>
            <p className="text-xs text-wa-muted font-medium uppercase tracking-wide mb-2">Recipients</p>
            <div className="space-y-1">
              {campaign.messages.map(m => (
                <div key={m.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-wa-input/40">
                  <MsgStatusIcon status={m.status} />
                  <span className="text-sm text-wa-text flex-1 truncate">{m.contact_name || m.phone}</span>
                  <span className="text-xs text-wa-muted shrink-0">{m.phone}</span>
                  {m.error && <span className="text-[10px] text-red-400 truncate max-w-[100px]">{m.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Draft: show contact list preview */}
        {campaign.status === 'draft' && campaign.messages?.length === 0 && (
          <div className="text-center py-8 text-wa-muted">
            <Users size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">{campaign.contact_count} contacts ready to send</p>
            <p className="text-xs mt-1">Press Send to deliver the campaign</p>
          </div>
        )}
      </div>

      {showBuilder && (
        <BuilderModal
          existingCampaign={campaign}
          onClose={() => setShowBuilder(false)}
          onSaved={updated => { setCampaign(updated); onUpdated?.(); }}
        />
      )}
    </div>
  );
}

// ── Main CampaignsPage ──────────────────────────────────────────────────────

export default function CampaignsPage({ onBack }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    try {
      const data = await api.getCampaigns();
      setCampaigns(data);
    } catch {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this campaign?')) return;
    try {
      await api.deleteCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      toast.success('Campaign deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (selectedId) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <CampaignDetail
          campaignId={selectedId}
          onBack={() => setSelectedId(null)}
          onUpdated={load}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-wa-dark">
      {/* Header */}
      <div className="px-4 py-3 border-b border-wa-border flex items-center gap-3 shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-full hover:bg-wa-hover text-wa-muted">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <BarChart2 size={17} className="text-wa-green" />
          <h1 className="text-sm font-semibold text-wa-text">Campaigns</h1>
          <span className="text-xs text-wa-muted bg-wa-input px-2 py-0.5 rounded-full">{campaigns.length}</span>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="flex items-center gap-1.5 bg-wa-green text-wa-darker px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-wa-green/90"
        >
          <Plus size={14} /> New
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader size={20} className="animate-spin text-wa-muted" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16 text-wa-muted">
            <Zap size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No campaigns yet</p>
            <p className="text-xs mt-1">Create one to start sending</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {campaigns.map(c => (
              <CampaignCard
                key={c.id}
                campaign={c}
                onSelect={c => setSelectedId(c.id)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showBuilder && (
        <BuilderModal
          onClose={() => setShowBuilder(false)}
          onSaved={saved => { setCampaigns(prev => [saved, ...prev]); }}
        />
      )}
    </div>
  );
}
