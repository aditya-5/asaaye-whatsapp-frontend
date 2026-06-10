import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Send, Image, FileText, Video, Plus, Trash2, ClipboardPaste, Table2,
  AlertCircle, ArrowLeft, Search, BookUser, ChevronDown, Loader,
  CheckCircle, XCircle, Clock, ExternalLink,
} from 'lucide-react';
import { api } from '../api';
import toast from 'react-hot-toast';

// ── Constants ──────────────────────────────────────────────────────────────────

const NOTION_SEGMENTS = [
  'Customer', 'Female', 'Male',
  'Exhibition-Kanpur', 'Exhibition-Mumbai', 'Exhibition-Jaipur', 'Exhibition-Lucknow',
  'Family/Friends',
];

const STATUS_COLORS = {
  'New': 'bg-gray-500', 'Replied': 'bg-blue-500', 'In Consultation': 'bg-yellow-500',
  'Converted': 'bg-green-500', 'Cold': 'bg-orange-700', 'Opted Out': 'bg-red-600',
};

const DRAFT_KEY = 'asaaye_bulk_draft';

// ── Pure helpers ───────────────────────────────────────────────────────────────

const formatWhatsAppText = (text) => {
  if (!text) return { __html: '' };
  let f = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  f = f.replace(/\*([\s\S]*?)\*/g, '<strong>$1</strong>');
  f = f.replace(/_([\s\S]*?)_/g, '<em>$1</em>');
  f = f.replace(/~([\s\S]*?)~/g, '<del>$1</del>');
  f = f.replace(/\n/g, '<br/>');
  return { __html: f };
};

const getBodyText = (t) => t?.components?.find(c => c.type === 'BODY')?.text || '';
const makeEmptyRow = (numParams = 0) => ({ phone: '', params: Array(numParams).fill(''), mediaUrl: '' });

function validateRow(row, numParams, hasMedia) {
  const errors = [];
  const phone = row.phone.replace(/\D/g, '');
  if (!phone || phone.length < 10) errors.push({ field: 'phone', msg: 'Invalid phone' });
  for (let i = 0; i < numParams; i++) {
    if (!row.params[i]?.trim()) errors.push({ field: `param_${i}`, msg: `Param ${i + 1} required` });
  }
  if (hasMedia && (!row.mediaUrl?.trim() || !row.mediaUrl.startsWith('http')))
    errors.push({ field: 'mediaUrl', msg: 'Valid URL required' });
  return errors;
}

function csvToRows(csv, numParams) {
  return csv.trim().split(/\r?\n/).map(line => {
    const cols = line.split(',').map(c => c.trim());
    return { phone: cols[0] || '', params: cols.slice(1, 1 + numParams), mediaUrl: cols[1 + numParams] || '' };
  }).filter(r => r.phone);
}

function rowsToCsv(rows) {
  return rows.filter(r => r.phone).map(r =>
    [r.phone, ...r.params, r.mediaUrl].filter((_, i, a) => i < a.length - 1 || a[a.length - 1]).join(', ')
  ).join('\n');
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const HeaderIcon = ({ format }) => {
  if (format === 'IMAGE') return <Image size={13} className="text-wa-green" />;
  if (format === 'VIDEO') return <Video size={13} className="text-wa-green" />;
  if (format === 'DOCUMENT') return <FileText size={13} className="text-wa-green" />;
  return null;
};

const CategoryBadge = ({ category, className = '' }) => {
  if (!category) return null;
  const styles = category === 'UTILITY'
    ? 'bg-blue-400/10 text-blue-400 border-blue-400/20'
    : category === 'MARKETING'
    ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
    : 'bg-purple-400/10 text-purple-400 border-purple-400/20';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${styles} ${className}`}>
      {category}
    </span>
  );
};

function MsgStatusIcon({ status }) {
  if (status === 'sent') return <CheckCircle size={13} className="text-wa-green shrink-0" />;
  if (status === 'failed') return <XCircle size={13} className="text-red-400 shrink-0" />;
  return <Clock size={13} className="text-wa-muted shrink-0" />;
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * Unified bulk send modal.
 *
 * one-off mode  — pass onSend, optional initialContacts. No campaign saved.
 * campaign mode — pass campaign={id?, name, status}. Saves+sends as a campaign.
 */
export default function BulkSendModal({ onClose, onSend, initialContacts = null, campaign = null }) {
  const isCampaignMode = !!campaign;
  const campaignId = campaign?.id || null;

  // ── Template state ────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  // ── Recipients state ──────────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState('table');
  const [rows, setRows] = useState(() =>
    initialContacts?.length
      ? initialContacts.map(c => ({ phone: c.phone.replace(/\D/g, ''), params: [], mediaUrl: '' }))
      : [makeEmptyRow()]
  );
  const [rowErrors, setRowErrors] = useState([]);
  const [csvData, setCsvData] = useState('');
  const [liveErrors, setLiveErrors] = useState([]);

  // ── Notion drawer ─────────────────────────────────────────────────────────────
  const [showNotionDrawer, setShowNotionDrawer] = useState(false);
  const [notionContacts, setNotionContacts] = useState([]);
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionSearch, setNotionSearch] = useState('');
  const [notionActiveSegments, setNotionActiveSegments] = useState([]);
  const [notionSelected, setNotionSelected] = useState(new Set());
  const [notionNameParam, setNotionNameParam] = useState(-1);

  // ── Draft ─────────────────────────────────────────────────────────────────────
  const [draftBanner, setDraftBanner] = useState(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // ── Preview & send ────────────────────────────────────────────────────────────
  const [showPreview, setShowPreview] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkErrors, setBulkErrors] = useState([]);
  const [previewImageError, setPreviewImageError] = useState(false);
  const [sending, setSending] = useState(false);

  // ── Campaign-specific ─────────────────────────────────────────────────────────
  const [campaignName, setCampaignName] = useState(campaign?.name || '');
  const [activeTab, setActiveTab] = useState('configure');
  const [campaignDetail, setCampaignDetail] = useState(campaign?.id ? null : campaign);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pollRef = useRef(null);

  const isSent = (campaignDetail?.status || campaign?.status) === 'sent';
  const numParams = selected?.param_count || 0;
  const hasMedia = !!selected && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selected.header_format);

  // ── Load templates ────────────────────────────────────────────────────────────

  useEffect(() => {
    api.getTemplates().then(data => {
      setTemplates(data);
      setLoading(false);
      if (!isCampaignMode) {
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          if (raw) setDraftBanner(JSON.parse(raw));
        } catch {}
      }
    }).catch(() => setLoading(false));
  }, []);

  // ── Load existing campaign data once templates are ready ──────────────────────

  useEffect(() => {
    if (!campaignId || templates.length === 0) return;
    setCampaignLoading(true);
    api.getCampaign(campaignId).then(data => {
      setCampaignDetail(data);
      // Set selected template
      if (data.template_name) {
        const tpl = templates.find(t => t.name === data.template_name);
        if (tpl) setSelected(tpl);
      }
      // Populate rows from contact_data
      if (data.contact_data) {
        try {
          const contacts = JSON.parse(data.contact_data);
          if (Array.isArray(contacts) && contacts.length > 0) {
            const pc = data.template_name
              ? (templates.find(t => t.name === data.template_name)?.param_count || 0)
              : 0;
            setRows(contacts.map(c => ({
              phone: c.phone || '',
              params: Array.from({ length: pc }, (_, i) => c.params?.[i] || ''),
              mediaUrl: c.media_url || '',
            })));
          }
        } catch {}
      }
    }).catch(() => {}).finally(() => setCampaignLoading(false));
  }, [campaignId, templates.length]);

  // ── Sync param count when template changes ────────────────────────────────────

  useEffect(() => {
    setRows(prev => prev.map(r => ({
      ...r,
      params: Array.from({ length: numParams }, (_, i) => r.params[i] || ''),
    })));
  }, [numParams]);

  // ── Live-validate table rows ──────────────────────────────────────────────────

  useEffect(() => {
    setRowErrors(rows.map(r => validateRow(r, numParams, hasMedia)));
  }, [rows, numParams, hasMedia]);

  // ── Live-validate CSV ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!csvData.trim() || !selected) { setLiveErrors([]); return; }
    const errors = [];
    csvData.trim().split(/\r?\n/).forEach((line, i) => {
      const cols = line.split(',').map(c => c.trim());
      const phone = (cols[0] || '').replace(/\D/g, '');
      if (!phone || phone.length < 10) errors.push(`Row ${i + 1}: Invalid phone "${cols[0]}"`);
      for (let p = 0; p < numParams; p++)
        if (!cols[1 + p]?.trim()) errors.push(`Row ${i + 1}: Param ${p + 1} required`);
      if (hasMedia && (!cols[1 + numParams]?.trim() || !cols[1 + numParams].startsWith('http')))
        errors.push(`Row ${i + 1}: Invalid media URL`);
    });
    setLiveErrors(errors);
  }, [csvData, selected, numParams, hasMedia]);

  // ── Autosave draft (one-off mode only) ────────────────────────────────────────

  useEffect(() => {
    if (isCampaignMode) return;
    const hasData = rows.some(r => r.phone.trim()) || csvData.trim();
    if (!selected && !hasData) return;
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ templateId: selected?.id, inputMode, rows, csvData }));
    }, 600);
    return () => clearTimeout(t);
  }, [selected, inputMode, rows, csvData, isCampaignMode]);

  // ── Beforeunload guard ────────────────────────────────────────────────────────

  const hasData = rows.some(r => r.phone.trim()) || csvData.trim();
  useEffect(() => {
    if (!hasData) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasData]);

  // ── Campaign stats polling ────────────────────────────────────────────────────

  useEffect(() => {
    if (campaignDetail?.status === 'sending') {
      pollRef.current = setInterval(async () => {
        try {
          const c = await api.getCampaign(campaignDetail.id);
          setCampaignDetail(c);
          if (c.status !== 'sending') clearInterval(pollRef.current);
        } catch {}
      }, 3000);
    }
    return () => clearInterval(pollRef.current);
  }, [campaignDetail?.status]);

  // ── Draft restore ─────────────────────────────────────────────────────────────

  const restoreDraft = () => {
    if (!draftBanner) return;
    if (draftBanner.templateId) {
      const t = templates.find(t => t.id === draftBanner.templateId);
      if (t) setSelected(t);
    }
    if (draftBanner.inputMode) setInputMode(draftBanner.inputMode);
    if (draftBanner.rows?.length) setRows(draftBanner.rows);
    if (draftBanner.csvData) setCsvData(draftBanner.csvData);
    setDraftBanner(null);
  };

  const discardDraft = () => { localStorage.removeItem(DRAFT_KEY); setDraftBanner(null); };

  // ── Notion drawer ─────────────────────────────────────────────────────────────

  const openNotionDrawer = async () => {
    setShowNotionDrawer(true);
    setNotionSearch(''); setNotionActiveSegments([]); setNotionSelected(new Set());
    if (notionContacts.length > 0) return;
    setNotionLoading(true);
    try {
      const data = await api.getNotionContacts('', '');
      setNotionContacts(data);
    } catch { toast.error('Failed to load Notion contacts'); }
    finally { setNotionLoading(false); }
  };

  const toggleNotionSegment = (seg) => {
    setNotionActiveSegments(prev => prev.includes(seg) ? prev.filter(s => s !== seg) : [...prev, seg]);
  };

  const existingPhones = new Set(rows.map(r => r.phone.replace(/\D/g, '')).filter(p => p.length >= 10));

  const filteredNotion = notionContacts.filter(c => {
    const segMatch = notionActiveSegments.length === 0 || notionActiveSegments.every(s => c.segments.includes(s));
    const searchVal = notionSearch.toLowerCase();
    const textMatch = !searchVal || c.name.toLowerCase().includes(searchVal) || c.phone.includes(searchVal);
    return segMatch && textMatch;
  });

  const selectableNotion = filteredNotion.filter(c => !existingPhones.has(c.phone.replace(/\D/g, '')));
  const allVisibleSelected = selectableNotion.length > 0 && selectableNotion.every(c => notionSelected.has(c.phone));

  const toggleNotionSelectAll = () => {
    if (allVisibleSelected) {
      setNotionSelected(prev => { const n = new Set(prev); selectableNotion.forEach(c => n.delete(c.phone)); return n; });
    } else {
      setNotionSelected(prev => { const n = new Set(prev); selectableNotion.forEach(c => n.add(c.phone)); return n; });
    }
  };

  const addNotionContacts = () => {
    const toAdd = notionContacts
      .filter(c => notionSelected.has(c.phone) && !existingPhones.has(c.phone.replace(/\D/g, '')))
      .map(c => {
        const params = Array(numParams).fill('');
        if (notionNameParam >= 0 && notionNameParam < numParams) params[notionNameParam] = c.name || '';
        return { phone: c.phone.replace(/\D/g, ''), params, mediaUrl: '' };
      });
    setRows(prev => {
      const filled = prev.filter(r => r.phone.trim());
      return filled.length > 0 ? [...filled, ...toAdd] : toAdd.length > 0 ? toAdd : [makeEmptyRow(numParams)];
    });
    setInputMode('table');
    setShowNotionDrawer(false);
    setNotionSelected(new Set());
    toast.success(`Added ${toAdd.length} contact${toAdd.length !== 1 ? 's' : ''}`);
  };

  // ── Table helpers ─────────────────────────────────────────────────────────────

  const applyFirstRowMedia = () => {
    const firstUrl = rows[0]?.mediaUrl?.trim();
    if (!firstUrl) return;
    setRows(prev => prev.map((r, i) => i === 0 ? r : { ...r, mediaUrl: firstUrl }));
  };

  const applyFirstRowParam = (pi) => {
    const firstVal = rows[0]?.params[pi]?.trim();
    if (!firstVal) return;
    setRows(prev => prev.map((r, i) => i === 0 ? r : { ...r, params: r.params.map((p, j) => j === pi ? firstVal : p) }));
  };

  const addRow = () => setRows(prev => [...prev, makeEmptyRow(numParams)]);
  const removeRow = (i) => setRows(prev => prev.length === 1 ? [makeEmptyRow(numParams)] : prev.filter((_, idx) => idx !== i));
  const updateCell = (ri, field, value) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== ri) return r;
      if (field === 'phone') return { ...r, phone: value };
      if (field === 'mediaUrl') return { ...r, mediaUrl: value };
      if (field.startsWith('param_')) {
        const pi = parseInt(field.split('_')[1]);
        const params = [...r.params]; params[pi] = value;
        return { ...r, params };
      }
      return r;
    }));
  };

  const switchToTable = () => {
    if (csvData.trim()) { const parsed = csvToRows(csvData, numParams); if (parsed.length > 0) setRows(parsed); }
    setInputMode('table');
  };

  const switchToCsv = () => {
    const csv = rowsToCsv(rows); if (csv) setCsvData(csv);
    setInputMode('csv');
  };

  // ── Preview & Send ────────────────────────────────────────────────────────────

  const handlePreview = () => {
    const validRows = [], errors = [];
    if (inputMode === 'table') {
      rows.forEach((r, i) => {
        if (!r.phone.trim()) return;
        const errs = validateRow(r, numParams, hasMedia);
        if (errs.length) errors.push(`Row ${i + 1}: ${errs.map(e => e.msg).join(', ')}`);
        else validRows.push({ phone: r.phone.replace(/\D/g, ''), params: r.params, mediaUrl: r.mediaUrl });
      });
    } else {
      csvData.trim().split(/\r?\n/).forEach((line, i) => {
        if (!line.trim()) return;
        const cols = line.split(',').map(c => c.trim());
        const phone = (cols[0] || '').replace(/\D/g, '');
        if (!phone || phone.length < 10) { errors.push(`Row ${i + 1}: Invalid phone`); return; }
        const params = cols.slice(1, 1 + numParams);
        if (params.length < numParams || params.some(p => !p.trim())) { errors.push(`Row ${i + 1}: Missing params`); return; }
        const mediaUrl = cols[1 + numParams] || '';
        if (hasMedia && (!mediaUrl.trim() || !mediaUrl.startsWith('http'))) { errors.push(`Row ${i + 1}: Invalid media URL`); return; }
        validRows.push({ phone, params, mediaUrl });
      });
    }
    setBulkRows(validRows); setBulkErrors(errors);
    setPreviewImageError(false); setShowPreview(true);
  };

  // One-off send
  const handleSendOneOff = () => {
    setShowPreview(false);
    localStorage.removeItem(DRAFT_KEY);
    onClose();
    toast.promise(
      (async () => {
        let sent = 0, failed = 0;
        for (const row of bulkRows) {
          const bodyParams = row.params.map(p => ({ type: 'text', text: p }));
          const data = { phone: row.phone, template_name: selected.name, language_code: selected.language, body_params: bodyParams };
          if (selected.header_format === 'IMAGE' && row.mediaUrl) data.header_image_url = row.mediaUrl;
          else if (selected.header_format === 'VIDEO' && row.mediaUrl) data.header_video_url = row.mediaUrl;
          else if (selected.header_format === 'DOCUMENT' && row.mediaUrl) data.header_document_url = row.mediaUrl;
          try { await onSend(data); sent++; } catch { failed++; }
        }
        if (failed > 0) throw new Error(`${sent} sent, ${failed} failed`);
        return `Sent to ${sent} contact${sent !== 1 ? 's' : ''}`;
      })(),
      { loading: `Sending to ${bulkRows.length}…`, success: m => m, error: e => e.message }
    );
  };

  // Campaign send
  const handleSendCampaign = async () => {
    setSending(true);
    try {
      const contacts = bulkRows.map(r => ({
        phone: r.phone,
        name: '',
        params: r.params,
        media_url: r.mediaUrl || undefined,
      }));
      const payload = {
        name: (campaignName.trim() || `Campaign ${new Date().toLocaleDateString()}`),
        template_name: selected.name,
        language_code: selected.language || 'en',
        contacts,
      };
      let saved;
      if (campaignId) {
        saved = await api.updateCampaign(campaignId, payload);
      } else {
        saved = await api.createCampaign(payload);
      }
      const result = await api.sendCampaign(saved.id);
      setCampaignDetail(result);
      setShowPreview(false);
      setActiveTab('stats');
      toast.success(`Campaign sent to ${result.stats?.sent ?? bulkRows.length} contacts`);
    } catch (e) {
      toast.error(e.message || 'Failed to send campaign');
    } finally {
      setSending(false);
    }
  };

  const handleSendFromPreview = () => {
    if (isCampaignMode) handleSendCampaign();
    else handleSendOneOff();
  };

  // ── Export to Notion ──────────────────────────────────────────────────────────

  const handleExport = async () => {
    if (!campaignDetail?.id) return;
    setExporting(true);
    try {
      await api.exportCampaignToNotion(campaignDetail.id);
      setCampaignDetail(prev => ({ ...prev, notion_exported: true }));
      toast.success('Exported to Notion Activity Log');
    } catch (e) {
      toast.error(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // ── Back / discard ────────────────────────────────────────────────────────────

  const handleBack = () => {
    if (!isCampaignMode && hasData) setShowDiscardConfirm(true);
    else { localStorage.removeItem(DRAFT_KEY); onClose(); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const filteredTemplates = categoryFilter === 'ALL' ? templates : templates.filter(t => t.category === categoryFilter);
  const tableHasAnyError = rowErrors.some(e => e.length > 0);
  const tableHasAnyRow = rows.some(r => r.phone.trim());
  const canPreview = selected && (inputMode === 'table' ? tableHasAnyRow : csvData.trim().length > 0);
  const paramLabels = selected?.param_labels || [];
  const colHeaders = ['Phone', ...Array.from({ length: numParams }, (_, i) => paramLabels[i] || `Param ${i + 1}`), ...(hasMedia ? [selected.header_format + ' URL'] : [])];
  const recipientCount = inputMode === 'table'
    ? rows.filter(r => r.phone.trim()).length
    : csvData.trim().split(/\r?\n/).filter(l => l.trim()).length;

  const configureDisabled = isSent;
  const statsAvailable = !!(campaignDetail?.id);

  // ── Stats tab ─────────────────────────────────────────────────────────────────

  const StatsTab = () => {
    if (!statsAvailable) {
      return (
        <div className="flex-1 flex items-center justify-center text-wa-muted">
          <div className="text-center">
            <p className="text-sm">Send the campaign to see stats</p>
          </div>
        </div>
      );
    }

    if (campaignLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <Loader size={22} className="animate-spin text-wa-muted" />
        </div>
      );
    }

    const cd = campaignDetail;
    const { stats } = cd || {};

    return (
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
            cd?.status === 'sent' ? 'bg-wa-green/15 text-wa-green border-wa-green/30'
            : cd?.status === 'sending' ? 'bg-yellow-400/20 text-yellow-400 border-yellow-400/30'
            : 'bg-wa-input text-wa-muted border-wa-border'
          }`}>{cd?.status || 'draft'}</span>
          {cd?.sent_at && <span className="text-xs text-wa-muted">{new Date(cd.sent_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
          {cd?.status === 'sending' && <Loader size={13} className="animate-spin text-wa-muted ml-1" />}
        </div>

        {/* Stats grid */}
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
        {cd?.status === 'sent' && (
          <button
            onClick={handleExport}
            disabled={exporting || cd.notion_exported}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
              cd.notion_exported
                ? 'bg-wa-input border-wa-border text-wa-muted cursor-default'
                : 'bg-wa-input border-wa-green/40 text-wa-green hover:bg-wa-green/10'
            }`}
          >
            {exporting ? <Loader size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            {cd.notion_exported ? 'Exported to Notion ✓' : 'Export to Notion Activity Log'}
          </button>
        )}

        {/* Message list */}
        {cd?.messages?.length > 0 && (
          <div>
            <p className="text-xs text-wa-muted font-medium uppercase tracking-wide mb-2">Recipients</p>
            <div className="space-y-1">
              {cd.messages.map(m => (
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

        {!stats && (
          <div className="text-center py-8 text-wa-muted">
            <p className="text-sm">{cd?.contact_count || 0} contacts ready</p>
            <p className="text-xs mt-1">Switch to Configure to build and send</p>
          </div>
        )}
      </div>
    );
  };

  // ── Notion contact toggle ─────────────────────────────────────────────────────

  const toggleNotionContact = (phone) => {
    setNotionSelected(prev => { const n = new Set(prev); n.has(phone) ? n.delete(phone) : n.add(phone); return n; });
  };

  // ── Configure body (same as TemplatePicker) ───────────────────────────────────

  const ConfigureBody = () => (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">

      {/* Mobile: template select dropdown + collapsible preview */}
      <div className="md:hidden shrink-0 border-b border-wa-border">
        {!loading && templates.length > 0 && (
          <div className="flex gap-1.5 px-3 pt-2">
            {['ALL', 'UTILITY', 'MARKETING'].map(cat => (
              <button key={cat} onClick={() => setCategoryFilter(cat)}
                disabled={configureDisabled}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? cat === 'UTILITY' ? 'bg-blue-400/20 text-blue-400 border border-blue-400/30'
                      : cat === 'MARKETING' ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30'
                      : 'bg-wa-green text-wa-darker'
                    : 'bg-wa-input text-wa-muted hover:text-wa-text border border-transparent'
                } ${configureDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >{cat === 'ALL' ? 'All' : cat.charAt(0) + cat.slice(1).toLowerCase()}</button>
            ))}
          </div>
        )}
        <div className="px-3 pt-2 pb-2 flex items-center gap-2">
          {loading ? (
            <p className="text-wa-muted text-sm py-1 flex-1">Loading templates…</p>
          ) : (
            <select
              value={selected?.id || ''}
              onChange={e => { const t = templates.find(t => t.id === e.target.value); if (t) { setSelected(t); setBulkRows([]); setBulkErrors([]); setMobilePreviewOpen(false); } }}
              disabled={configureDisabled}
              className="flex-1 min-w-0 bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2.5 outline-none border border-wa-border focus:ring-1 focus:ring-wa-green/30 disabled:opacity-50"
            >
              <option value="">Select a template…</option>
              {filteredTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.status !== 'APPROVED' ? ` (${t.status})` : ''}</option>
              ))}
            </select>
          )}
          {selected && (
            <button
              onClick={() => setMobilePreviewOpen(p => !p)}
              className="shrink-0 p-2 rounded-lg bg-wa-input border border-wa-border text-wa-muted hover:text-wa-text transition-colors"
            >
              <ChevronDown size={16} className={`transition-transform duration-200 ${mobilePreviewOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        {selected && (
          <div className="px-3 pb-2 flex items-center gap-2">
            <CategoryBadge category={selected.category} />
            {selected.header_format && (
              <span className="text-[11px] text-wa-muted flex items-center gap-1">
                <HeaderIcon format={selected.header_format} /> {selected.header_format} header
              </span>
            )}
          </div>
        )}
        {selected && mobilePreviewOpen && (
          <div className="mx-3 mb-2 px-3 py-2 bg-wa-incoming/40 border border-wa-border/50 rounded-lg">
            {selected.header_format && (
              <div className="flex items-center gap-1 mb-1">
                <HeaderIcon format={selected.header_format} />
                <span className="text-[11px] text-wa-green">{selected.header_format} header</span>
              </div>
            )}
            <p className="text-[12px] text-wa-text leading-relaxed whitespace-pre-wrap">
              {getBodyText(selected) || <span className="text-wa-muted italic">No body text</span>}
            </p>
            {numParams > 0 && (
              <p className="text-[11px] text-wa-muted mt-1">{numParams} parameter{numParams !== 1 ? 's' : ''} required</p>
            )}
          </div>
        )}
      </div>

      {/* Left: Template list — desktop only */}
      <div className="hidden md:flex w-64 shrink-0 border-r border-wa-border flex-col overflow-hidden">
        <div className="px-3 pt-2.5 pb-2 border-b border-wa-border shrink-0 space-y-2">
          <p className="text-xs font-semibold text-wa-muted uppercase tracking-wider">1 · Select Template</p>
          <div className="flex gap-1 bg-wa-input/50 rounded-lg p-0.5">
            {['ALL', 'UTILITY', 'MARKETING'].map(cat => (
              <button key={cat} onClick={() => !configureDisabled && setCategoryFilter(cat)}
                className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-all ${
                  categoryFilter === cat
                    ? cat === 'UTILITY' ? 'bg-blue-400/20 text-blue-400 shadow'
                      : cat === 'MARKETING' ? 'bg-amber-400/20 text-amber-400 shadow'
                      : 'bg-wa-dark text-wa-green shadow'
                    : 'text-wa-muted hover:text-wa-text'
                } ${configureDisabled ? 'cursor-default' : ''}`}
              >{cat === 'ALL' ? 'All' : cat.charAt(0) + cat.slice(1).toLowerCase()}</button>
            ))}
          </div>
        </div>
        <div className={`flex-1 overflow-y-auto p-2 space-y-1.5 ${configureDisabled ? 'pointer-events-none opacity-60' : ''}`}>
          {loading ? (
            <p className="text-wa-muted text-sm px-2 py-4">Loading…</p>
          ) : filteredTemplates.length === 0 ? (
            <p className="text-wa-muted text-sm px-2 py-4">No templates found</p>
          ) : filteredTemplates.map(t => (
            <div key={t.id} onClick={() => { setSelected(t); setBulkRows([]); setBulkErrors([]); }}
              className={`p-2.5 rounded-lg cursor-pointer border transition-all ${selected?.id === t.id ? 'border-wa-green bg-wa-green/10' : 'border-wa-border/60 hover:border-wa-muted/50 bg-wa-input/40'}`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-sm font-medium text-wa-text truncate">{t.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${t.status === 'APPROVED' ? 'bg-wa-green/10 text-wa-green' : 'bg-orange-500/10 text-orange-400'}`}>
                  {t.status}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <CategoryBadge category={t.category} />
                {t.header_format && <HeaderIcon format={t.header_format} />}
              </div>
              <p className={`text-[11px] text-wa-muted whitespace-pre-wrap ${selected?.id === t.id ? '' : 'line-clamp-2'}`}>{getBodyText(t)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Recipients */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${configureDisabled ? 'pointer-events-none opacity-60' : ''}`}>

        {/* Recipients header */}
        <div className="px-3 py-2 border-b border-wa-border shrink-0 flex items-center gap-2">
          <p className="hidden md:block text-xs font-semibold text-wa-muted uppercase tracking-wider flex-1">2 · Add Recipients</p>
          <div className="flex-1 md:hidden" />
          <button
            onClick={showNotionDrawer ? () => setShowNotionDrawer(false) : openNotionDrawer}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${showNotionDrawer ? 'bg-wa-green/10 border-wa-green/30 text-wa-green' : 'border-wa-border text-wa-muted hover:text-wa-text hover:border-wa-muted/50'}`}
          >
            <BookUser size={13} /> <span className="hidden sm:inline">From Notion</span>
          </button>
          {!showNotionDrawer && (
            <div className="flex bg-wa-input rounded-lg p-0.5 gap-0.5">
              <button onClick={() => inputMode === 'csv' ? switchToTable() : null}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${inputMode === 'table' ? 'bg-wa-dark text-wa-text shadow' : 'text-wa-muted hover:text-wa-text'}`}
              >
                <Table2 size={13} /> <span className="hidden sm:inline">Table</span>
              </button>
              <button onClick={() => inputMode === 'table' ? switchToCsv() : null}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${inputMode === 'csv' ? 'bg-wa-dark text-wa-text shadow' : 'text-wa-muted hover:text-wa-text'}`}
              >
                <ClipboardPaste size={13} /> <span className="hidden sm:inline">CSV</span>
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        {showNotionDrawer ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="shrink-0 px-3 py-2 border-b border-wa-border flex gap-1.5 overflow-x-auto scrollbar-none">
              {NOTION_SEGMENTS.map(seg => (
                <button key={seg} onClick={() => toggleNotionSegment(seg)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${notionActiveSegments.includes(seg) ? 'bg-wa-green text-wa-darker' : 'bg-wa-input text-wa-muted hover:text-wa-text'}`}
                >{seg}</button>
              ))}
            </div>
            <div className="shrink-0 px-3 py-2 border-b border-wa-border">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-wa-muted" />
                <input type="text" placeholder="Search name or phone…" value={notionSearch}
                  onChange={e => setNotionSearch(e.target.value)}
                  className="w-full bg-wa-input text-wa-text text-sm rounded-lg pl-7 pr-3 py-1.5 outline-none placeholder:text-wa-muted focus:ring-1 focus:ring-wa-green/30"
                />
              </div>
            </div>
            {numParams > 0 && (
              <div className="shrink-0 px-3 py-2 border-b border-wa-border flex items-center gap-2 bg-wa-input/20">
                <span className="text-[11px] text-wa-muted whitespace-nowrap">Map name →</span>
                <select value={notionNameParam} onChange={e => setNotionNameParam(parseInt(e.target.value))}
                  className="flex-1 min-w-0 bg-wa-input text-wa-text text-xs rounded-lg px-2 py-1 outline-none border border-wa-border focus:ring-1 focus:ring-wa-green/30"
                >
                  <option value={-1}>Don't map</option>
                  {Array.from({ length: numParams }, (_, i) => (
                    <option key={i} value={i}>{paramLabels[i] || `Param ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            )}
            {filteredNotion.length > 0 && (
              <div className="shrink-0 px-3 py-1.5 border-b border-wa-border flex items-center justify-between">
                <button onClick={toggleNotionSelectAll} className="text-xs text-wa-muted hover:text-wa-green transition-colors">
                  {allVisibleSelected ? 'Deselect all' : `Select all (${selectableNotion.length})`}
                </button>
                {notionSelected.size > 0 && <span className="text-xs text-wa-green font-medium">{notionSelected.size} selected</span>}
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {notionLoading ? (
                <p className="text-center text-wa-muted text-sm py-8">Loading contacts…</p>
              ) : filteredNotion.length === 0 ? (
                <p className="text-center text-wa-muted text-sm py-8">No contacts found</p>
              ) : filteredNotion.map(c => {
                const alreadyAdded = existingPhones.has(c.phone.replace(/\D/g, ''));
                const isChecked = notionSelected.has(c.phone);
                return (
                  <div key={c.phone}
                    onClick={() => !alreadyAdded && toggleNotionContact(c.phone)}
                    className={`flex items-center gap-3 px-3 py-2.5 border-b border-wa-border/30 transition-colors ${alreadyAdded ? 'opacity-40 cursor-default' : 'hover:bg-wa-hover/50 cursor-pointer'} ${isChecked ? 'bg-wa-green/5' : ''}`}
                  >
                    <input type="checkbox" checked={isChecked || alreadyAdded} disabled={alreadyAdded}
                      onChange={() => {}} className="accent-wa-green w-4 h-4 shrink-0 pointer-events-none"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-wa-text truncate">{c.name || 'Unknown'}</span>
                        {alreadyAdded && <span className="text-[10px] text-wa-green bg-wa-green/10 px-1.5 py-0.5 rounded-full">Added</span>}
                        {c.status && !alreadyAdded && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full text-white ${STATUS_COLORS[c.status] || 'bg-gray-600'}`}>{c.status}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-wa-muted font-mono">{c.phone}</span>
                        {c.segments.slice(0, 2).map(s => (
                          <span key={s} className="text-[10px] text-wa-muted/60 bg-wa-input px-1 rounded">{s}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {notionSelected.size > 0 && (
              <div className="shrink-0 px-4 py-3 border-t border-wa-border">
                <button onClick={addNotionContacts}
                  className="w-full flex items-center justify-center gap-2 bg-wa-green text-wa-darker py-2.5 rounded-lg font-semibold text-sm hover:bg-wa-green/90 transition-colors"
                >
                  <Plus size={15} />
                  Add {notionSelected.size} contact{notionSelected.size !== 1 ? 's' : ''} to table
                </button>
              </div>
            )}
          </div>
        ) : inputMode === 'table' ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-wa-muted">
                <p className="text-sm">Select a template first to see columns</p>
                <p className="text-xs">or use <span className="text-wa-green font-medium">From Notion</span> to import contacts</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-auto">
                  <div className="min-w-max px-4">
                    <div className="flex items-center gap-2 py-2 border-b border-wa-border bg-wa-input/30 sticky top-0">
                      {colHeaders.map((h, i) => {
                        const isMediaCol = hasMedia && i === colHeaders.length - 1;
                        const isParamCol = i > 0 && !isMediaCol;
                        const pi = i - 1;
                        return (
                          <div key={i} className={`text-[11px] font-semibold text-wa-muted uppercase tracking-wide shrink-0 flex items-center gap-1 ${i === 0 ? 'w-36' : isMediaCol ? 'w-40' : 'w-28'}`}>
                            {h}
                            {isMediaCol && (
                              <button onClick={applyFirstRowMedia} disabled={!rows[0]?.mediaUrl?.trim()}
                                className="text-[9px] font-bold text-wa-green border border-wa-green/40 px-1 py-0.5 rounded hover:bg-wa-green/10 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                              >COMMON</button>
                            )}
                            {isParamCol && (
                              <button onClick={() => applyFirstRowParam(pi)} disabled={!rows[0]?.params[pi]?.trim()}
                                className="text-[9px] font-bold text-wa-green border border-wa-green/40 px-1 py-0.5 rounded hover:bg-wa-green/10 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                              >COMMON</button>
                            )}
                          </div>
                        );
                      })}
                      <div className="w-7 shrink-0" />
                    </div>
                    <div className="py-2 space-y-1.5">
                      {rows.map((row, ri) => {
                        const errs = rowErrors[ri] || [];
                        const fieldErr = f => errs.find(e => e.field === f);
                        return (
                          <div key={ri} className="flex items-center gap-2">
                            <input type="text" value={row.phone} onChange={e => updateCell(ri, 'phone', e.target.value)}
                              placeholder="447700900000"
                              className={`w-36 shrink-0 bg-wa-input text-wa-text text-xs rounded-lg px-2.5 py-2 outline-none font-mono placeholder:text-wa-muted/40 ${fieldErr('phone') && row.phone ? 'ring-1 ring-red-400/60' : 'focus:ring-1 focus:ring-wa-green/30'}`}
                            />
                            {Array.from({ length: numParams }, (_, pi) => (
                              <input key={pi} type="text" value={row.params[pi] || ''} onChange={e => updateCell(ri, `param_${pi}`, e.target.value)}
                                placeholder={paramLabels[pi] || `{{${pi + 1}}}`}
                                className={`w-28 shrink-0 bg-wa-input text-wa-text text-xs rounded-lg px-2.5 py-2 outline-none placeholder:text-wa-muted/40 ${fieldErr(`param_${pi}`) && row.params[pi] !== undefined ? 'ring-1 ring-red-400/60' : 'focus:ring-1 focus:ring-wa-green/30'}`}
                              />
                            ))}
                            {hasMedia && (
                              <input type="url" value={row.mediaUrl} onChange={e => updateCell(ri, 'mediaUrl', e.target.value)}
                                placeholder="https://…"
                                className={`w-40 shrink-0 bg-wa-input text-wa-text text-xs rounded-lg px-2.5 py-2 outline-none placeholder:text-wa-muted/40 ${fieldErr('mediaUrl') && row.mediaUrl ? 'ring-1 ring-red-400/60' : 'focus:ring-1 focus:ring-wa-green/30'}`}
                              />
                            )}
                            <button onClick={() => removeRow(ri)}
                              className="w-7 shrink-0 flex items-center justify-center text-wa-muted/50 hover:text-red-400 transition-colors"
                            ><Trash2 size={13} /></button>
                          </div>
                        );
                      })}
                      <button onClick={addRow} className="flex items-center gap-1.5 text-xs text-wa-muted hover:text-wa-green transition-colors py-1 mt-1">
                        <Plus size={13} /> Add Row
                      </button>
                    </div>
                  </div>
                </div>
                {tableHasAnyError && tableHasAnyRow && (
                  <div className="shrink-0 mx-4 mb-2 px-3 py-2 bg-red-400/5 border border-red-400/20 rounded-lg flex items-start gap-2">
                    <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-red-400">Some rows have errors and will be skipped in preview</p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
            <div className="shrink-0 text-[11px] text-wa-muted p-2.5 bg-wa-input/50 rounded-lg leading-relaxed">
              <span className="font-semibold text-wa-text">Format</span> — one row per line, comma-separated, no header:<br />
              <span className="font-mono text-wa-green">
                Phone{numParams > 0 ? Array.from({ length: numParams }, (_, i) => `, ${paramLabels[i] || `Param${i + 1}`}`).join('') : ''}{hasMedia ? `, ${selected?.header_format}_URL` : ''}
              </span>
            </div>
            {liveErrors.length > 0 && (
              <div className="shrink-0 px-3 py-2 bg-red-400/5 border border-red-400/20 rounded-lg max-h-24 overflow-y-auto">
                {liveErrors.map((e, i) => <p key={i} className="text-[11px] text-red-400">• {e}</p>)}
              </div>
            )}
            <textarea value={csvData} onChange={e => setCsvData(e.target.value)}
              placeholder={`447700900000${numParams > 0 ? ', John' : ''}${hasMedia ? ', https://example.com/img.jpg' : ''}`}
              className="flex-1 min-h-0 bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2.5 outline-none resize-none placeholder:text-wa-muted/40 focus:ring-1 focus:ring-wa-green/30 font-mono"
            />
          </div>
        )}
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-wa-dark z-50 flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-wa-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-wa-hover transition-colors text-wa-muted">
            <ArrowLeft size={18} />
          </button>

          {isCampaignMode ? (
            <input
              type="text"
              value={campaignName}
              onChange={e => !isSent && setCampaignName(e.target.value)}
              placeholder="Campaign name…"
              readOnly={isSent}
              className={`flex-1 bg-transparent text-base font-semibold text-wa-text outline-none placeholder:text-wa-muted/50 ${isSent ? 'cursor-default' : ''}`}
            />
          ) : (
            <h1 className="text-base font-semibold text-wa-text flex-1">Bulk Send</h1>
          )}

          {selected && !isCampaignMode && (
            <>
              <span className="text-xs text-wa-green bg-wa-green/10 border border-wa-green/20 px-2 py-1 rounded-full font-medium truncate max-w-[140px] sm:max-w-none">
                {selected.name}
              </span>
              <CategoryBadge category={selected.category} />
            </>
          )}
        </div>

        {/* Campaign tabs */}
        {isCampaignMode && (
          <div className="flex px-4 gap-4 border-t border-wa-border/50">
            {['configure', 'stats'].map(tab => (
              <button
                key={tab}
                onClick={() => {
                  if (tab === 'stats' && !statsAvailable) return;
                  setActiveTab(tab);
                }}
                disabled={tab === 'stats' && !statsAvailable}
                className={`py-2.5 text-sm font-medium transition-colors border-b-2 capitalize ${
                  activeTab === tab
                    ? 'border-wa-green text-wa-green'
                    : 'border-transparent text-wa-muted hover:text-wa-text'
                } ${tab === 'stats' && !statsAvailable ? 'opacity-30 cursor-not-allowed' : ''}`}
              >
                {tab}
                {tab === 'stats' && statsAvailable && (
                  campaignDetail?.stats?.sent != null && (
                    <span className="ml-1.5 text-[10px] bg-wa-green/15 text-wa-green px-1.5 py-0.5 rounded-full">
                      {campaignDetail.stats.sent}
                    </span>
                  )
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Draft restore banner ─────────────────────────────────────────────── */}
      {!isCampaignMode && draftBanner && (
        <div className="shrink-0 mx-4 mt-3 px-4 py-2.5 bg-wa-green/10 border border-wa-green/20 rounded-lg flex items-center gap-3">
          <span className="text-sm text-wa-text flex-1">You have an unsaved draft from a previous session.</span>
          <button onClick={restoreDraft} className="text-xs font-semibold text-wa-green hover:underline">Restore</button>
          <button onClick={discardDraft} className="text-xs text-wa-muted hover:text-wa-text">Discard</button>
        </div>
      )}

      {/* Campaign loading overlay */}
      {isCampaignMode && campaignLoading && (
        <div className="shrink-0 flex items-center justify-center py-4 text-wa-muted gap-2">
          <Loader size={15} className="animate-spin" />
          <span className="text-xs">Loading campaign…</span>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      {activeTab === 'stats' ? (
        <StatsTab />
      ) : (
        <ConfigureBody />
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      {activeTab === 'configure' && (
        <div className="shrink-0 px-4 py-3 border-t border-wa-border flex items-center gap-3">
          <div className="flex-1 text-xs text-wa-muted">
            {showNotionDrawer
              ? `${filteredNotion.length} contacts in Notion`
              : `${recipientCount} recipient${recipientCount !== 1 ? 's' : ''}`}
          </div>
          {!showNotionDrawer && !configureDisabled && (
            <button onClick={handlePreview} disabled={!canPreview || sending}
              className="flex items-center gap-2 bg-wa-green text-wa-darker font-semibold px-5 py-2.5 rounded-lg hover:bg-wa-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
            >
              <Send size={15} />
              {isCampaignMode ? 'Preview & Send Campaign' : 'Preview & Send'}
            </button>
          )}
          {configureDisabled && (
            <span className="text-xs text-wa-muted">Campaign sent — configure is locked</span>
          )}
        </div>
      )}

      {/* ── Discard confirm ──────────────────────────────────────────────────── */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4">
          <div className="bg-wa-dark border border-wa-border rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-wa-text text-base mb-1">Discard this blast?</h3>
              <p className="text-sm text-wa-muted">Your recipients and template selection will be lost.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 py-2.5 text-sm font-medium text-wa-text hover:bg-wa-hover rounded-lg border border-wa-border transition-colors"
              >Keep Editing</button>
              <button onClick={() => { localStorage.removeItem(DRAFT_KEY); onClose(); }}
                className="flex-1 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-400/10 rounded-lg border border-red-400/30 transition-colors"
              >Discard</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview overlay ──────────────────────────────────────────────────── */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-wa-dark w-full max-w-xl rounded-xl border border-wa-border shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-wa-border flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-wa-text">Preview · {selected?.name}</h3>
              <button onClick={() => setShowPreview(false)}><X size={20} className="text-wa-muted" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-wa-input p-3 rounded-lg border border-wa-border text-center">
                  <div className="text-2xl font-bold text-wa-green">{bulkRows.length}</div>
                  <div className="text-xs text-wa-muted">Ready to Send</div>
                </div>
                <div className="bg-wa-input p-3 rounded-lg border border-wa-border text-center">
                  <div className="text-2xl font-bold text-red-400">{bulkErrors.length}</div>
                  <div className="text-xs text-wa-muted">Skipped (errors)</div>
                </div>
              </div>
              {bulkErrors.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Skipped rows</h4>
                  <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-3 space-y-1 max-h-36 overflow-y-auto">
                    {bulkErrors.map((e, i) => <p key={i} className="text-xs text-red-400">• {e}</p>)}
                  </div>
                </div>
              )}
              {bulkRows.length > 0 && (
                <>
                  <h4 className="text-xs font-semibold text-wa-muted uppercase tracking-wider">Message Preview (first recipient)</h4>
                  <div className="bg-wa-incoming/50 rounded-lg p-3 border border-wa-border">
                    {selected?.header_format === 'IMAGE' && bulkRows[0]?.mediaUrl && (
                      <div className="mb-2">
                        <img src={bulkRows[0].mediaUrl} onError={() => setPreviewImageError(true)} onLoad={() => setPreviewImageError(false)}
                          className={`w-full max-h-40 object-cover rounded border border-wa-border/50 bg-black/20 ${previewImageError ? 'hidden' : 'block'}`} alt="Preview"
                        />
                        {previewImageError && (
                          <p className="text-[11px] text-red-400 p-2 bg-red-900/10 border border-red-900/30 rounded">
                            Image couldn't load — sending may still work if the URL is valid.
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-[13px] text-wa-text leading-relaxed">
                      <span dangerouslySetInnerHTML={formatWhatsAppText(
                        getBodyText(selected).replace(/\{\{(\d+)\}\}/g, (_, d) => bulkRows[0]?.params[parseInt(d) - 1] || `{{${d}}}`)
                      )} />
                    </p>
                    {selected?.header_format && selected.header_format !== 'IMAGE' && bulkRows[0]?.mediaUrl && (
                      <div className="mt-2 text-[11px] text-wa-green flex items-center gap-1">
                        <HeaderIcon format={selected.header_format} /> With {selected.header_format.toLowerCase()} attachment
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-wa-border flex gap-3 shrink-0">
              <button onClick={() => setShowPreview(false)}
                className="flex-1 py-2.5 text-wa-text hover:bg-wa-hover rounded-lg border border-wa-border text-sm transition-colors"
              >Go Back</button>
              <button onClick={handleSendFromPreview} disabled={bulkRows.length === 0 || sending}
                className="flex-[2] py-2.5 bg-wa-green text-wa-darker font-bold rounded-lg hover:bg-wa-green/90 disabled:opacity-40 text-sm flex items-center justify-center gap-2 transition-all"
              >
                {sending
                  ? <><Loader size={14} className="animate-spin" /> Sending…</>
                  : <><Send size={14} /> {isCampaignMode ? 'Save & Send Campaign' : `Send to ${bulkRows.length} contact${bulkRows.length !== 1 ? 's' : ''}`}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
