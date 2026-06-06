import { useState, useEffect } from 'react';
import { X, Send, Image, FileText, Video, Users, Plus, Trash2, ClipboardPaste, Table2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { api } from '../api';
import toast from 'react-hot-toast';

const formatWhatsAppText = (text) => {
  if (!text) return { __html: '' };
  let formatted = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  formatted = formatted.replace(/\*([\s\S]*?)\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/_([\s\S]*?)_/g, '<em>$1</em>');
  formatted = formatted.replace(/~([\s\S]*?)~/g, '<del>$1</del>');
  formatted = formatted.replace(/\n/g, '<br/>');
  return { __html: formatted };
};

const HeaderIcon = ({ format }) => {
  switch (format) {
    case 'IMAGE': return <Image size={13} className="text-wa-green" />;
    case 'VIDEO': return <Video size={13} className="text-wa-green" />;
    case 'DOCUMENT': return <FileText size={13} className="text-wa-green" />;
    default: return null;
  }
};

const getBodyText = (template) => {
  const body = template?.components?.find(c => c.type === 'BODY');
  return body?.text || '';
};

const makeEmptyRow = () => ({ phone: '', params: [], mediaUrl: '' });

// Validate a single table row — returns array of field-level errors { field, msg }
function validateRow(row, numParams, hasMedia) {
  const errors = [];
  const phone = row.phone.replace(/\D/g, '');
  if (!phone || phone.length < 10) errors.push({ field: 'phone', msg: 'Invalid phone' });
  for (let i = 0; i < numParams; i++) {
    if (!row.params[i] || !row.params[i].trim()) errors.push({ field: `param_${i}`, msg: `Param ${i + 1} required` });
  }
  if (hasMedia && (!row.mediaUrl || !row.mediaUrl.trim() || !row.mediaUrl.startsWith('http'))) {
    errors.push({ field: 'mediaUrl', msg: 'Valid URL required' });
  }
  return errors;
}

// Parse CSV text into table rows
function csvToRows(csv, numParams) {
  return csv.trim().split(/\r?\n/).map(line => {
    const cols = line.split(',').map(c => c.trim());
    return {
      phone: cols[0] || '',
      params: cols.slice(1, 1 + numParams),
      mediaUrl: cols[1 + numParams] || '',
    };
  }).filter(r => r.phone);
}

// Serialize table rows back to CSV string
function rowsToCsv(rows) {
  return rows.map(r => [r.phone, ...r.params, r.mediaUrl].join(', ')).join('\n');
}

export default function TemplatePicker({ onClose, onSend, initialContact = null }) {
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputMode, setInputMode] = useState('table'); // 'table' | 'csv'

  // CSV mode state
  const [csvData, setCsvData] = useState('');
  const [liveErrors, setLiveErrors] = useState([]);

  // Table mode state
  const [rows, setRows] = useState([makeEmptyRow()]);
  const [rowErrors, setRowErrors] = useState([]); // array of error arrays, one per row

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkErrors, setBulkErrors] = useState([]);
  const [previewImageError, setPreviewImageError] = useState(false);

  const numParams = selected?.param_count || 0;
  const hasMedia = selected && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selected.header_format);

  useEffect(() => {
    api.getTemplates().then(data => { setTemplates(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Pre-populate table if a contact was passed in (from ContactPicker single-select)
  useEffect(() => {
    if (initialContact) {
      setRows([{ phone: initialContact.phone, params: [], mediaUrl: '' }]);
    }
  }, [initialContact]);

  // Sync params array length when template changes
  useEffect(() => {
    setRows(prev => prev.map(r => ({
      ...r,
      params: Array.from({ length: numParams }, (_, i) => r.params[i] || ''),
    })));
  }, [numParams]);

  // Live-validate table rows
  useEffect(() => {
    setRowErrors(rows.map(r => validateRow(r, numParams, hasMedia)));
  }, [rows, numParams, hasMedia]);

  // Live-validate CSV
  useEffect(() => {
    if (!csvData.trim() || !selected) { setLiveErrors([]); return; }
    const errors = [];
    const lines = csvData.trim().split(/\r?\n/);
    lines.forEach((line, i) => {
      const cols = line.split(',').map(c => c.trim());
      const phone = (cols[0] || '').replace(/\D/g, '');
      if (!phone || phone.length < 10) errors.push(`Row ${i + 1}: Invalid phone "${cols[0]}"`);
      for (let p = 0; p < numParams; p++) {
        if (!cols[1 + p] || !cols[1 + p].trim()) errors.push(`Row ${i + 1}: Param ${p + 1} required`);
      }
      if (hasMedia) {
        const url = cols[1 + numParams] || '';
        if (!url.trim() || !url.startsWith('http')) errors.push(`Row ${i + 1}: Invalid media URL`);
      }
    });
    setLiveErrors(errors);
  }, [csvData, selected, numParams, hasMedia]);

  const handleSelectTemplate = (t) => {
    setSelected(t);
    setBulkRows([]);
    setBulkErrors([]);
  };

  // ── Table helpers ──────────────────────────────────────────────────────────

  const addRow = () => setRows(prev => [...prev, { phone: '', params: Array(numParams).fill(''), mediaUrl: '' }]);

  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const updateCell = (rowIdx, field, value) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      if (field === 'phone') return { ...r, phone: value };
      if (field === 'mediaUrl') return { ...r, mediaUrl: value };
      if (field.startsWith('param_')) {
        const pi = parseInt(field.split('_')[1]);
        const params = [...r.params];
        params[pi] = value;
        return { ...r, params };
      }
      return r;
    }));
  };

  const switchToTable = () => {
    if (csvData.trim()) {
      const parsed = csvToRows(csvData, numParams);
      if (parsed.length > 0) setRows(parsed);
    }
    setInputMode('table');
  };

  const switchToCsv = () => {
    const csv = rowsToCsv(rows.filter(r => r.phone));
    if (csv) setCsvData(csv);
    setInputMode('csv');
  };

  // ── Validate & build preview ───────────────────────────────────────────────

  const handlePreview = () => {
    const validRows = [];
    const errors = [];

    if (inputMode === 'table') {
      rows.forEach((r, i) => {
        if (!r.phone.trim()) return;
        const errs = validateRow(r, numParams, hasMedia);
        if (errs.length > 0) {
          errors.push(`Row ${i + 1}: ${errs.map(e => e.msg).join(', ')}`);
        } else {
          validRows.push({ phone: r.phone.replace(/\D/g, ''), params: r.params, mediaUrl: r.mediaUrl });
        }
      });
    } else {
      const lines = csvData.trim().split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!line.trim()) return;
        const cols = line.split(',').map(c => c.trim());
        const phone = (cols[0] || '').replace(/\D/g, '');
        if (!phone || phone.length < 10) { errors.push(`Row ${i + 1}: Invalid phone "${cols[0]}"`); return; }
        const params = cols.slice(1, 1 + numParams);
        if (params.length < numParams || params.some(p => !p.trim())) { errors.push(`Row ${i + 1}: Missing params`); return; }
        const mediaUrl = cols[1 + numParams] || '';
        if (hasMedia && (!mediaUrl.trim() || !mediaUrl.startsWith('http'))) { errors.push(`Row ${i + 1}: Invalid media URL`); return; }
        validRows.push({ phone, params, mediaUrl });
      });
    }

    setBulkRows(validRows);
    setBulkErrors(errors);
    setPreviewImageError(false);
    setShowPreview(true);
  };

  const handleSendBulk = () => {
    setShowPreview(false);
    onClose();

    toast.promise(
      (async () => {
        let sentCount = 0;
        let failCount = 0;
        for (const row of bulkRows) {
          const bodyParams = row.params.map(p => ({ type: 'text', text: p }));
          const data = { phone: row.phone, template_name: selected.name, language_code: selected.language, body_params: bodyParams };
          if (selected.header_format === 'IMAGE' && row.mediaUrl) data.header_image_url = row.mediaUrl;
          else if (selected.header_format === 'VIDEO' && row.mediaUrl) data.header_video_url = row.mediaUrl;
          else if (selected.header_format === 'DOCUMENT' && row.mediaUrl) data.header_document_url = row.mediaUrl;
          try { await onSend(data); sentCount++; } catch { failCount++; }
        }
        if (failCount > 0) throw new Error(`${sentCount} sent, ${failCount} failed`);
        return `Sent to ${sentCount} contact${sentCount !== 1 ? 's' : ''}`;
      })(),
      { loading: `Sending to ${bulkRows.length}…`, success: msg => msg, error: err => err.message }
    );
  };

  // ── Derived UI state ───────────────────────────────────────────────────────

  const tableHasAnyError = rowErrors.some(errs => errs.length > 0);
  const tableHasAnyRow = rows.some(r => r.phone.trim());
  const csvHasContent = csvData.trim().length > 0;
  const canPreview = selected && (inputMode === 'table' ? tableHasAnyRow : csvHasContent);

  const colHeaders = ['Phone', ...Array.from({ length: numParams }, (_, i) => `Param ${i + 1}`), ...(hasMedia ? [selected.header_format + ' URL'] : [])];

  return (
    <div className="fixed inset-0 bg-wa-dark z-50 flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-wa-border bg-wa-dark">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-wa-hover transition-colors text-wa-muted">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-base font-semibold text-wa-text flex-1">Bulk Send</h1>
        {selected && (
          <span className="text-xs text-wa-green bg-wa-green/10 border border-wa-green/20 px-2 py-1 rounded-full font-medium">
            {selected.name}
          </span>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left: Template list */}
        <div className="w-64 shrink-0 border-r border-wa-border flex flex-col bg-wa-dark overflow-hidden">
          <div className="px-3 py-2.5 border-b border-wa-border shrink-0">
            <p className="text-xs font-semibold text-wa-muted uppercase tracking-wider">1 · Select Template</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loading ? (
              <p className="text-wa-muted text-sm px-2 py-4">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="text-wa-muted text-sm px-2 py-4">No templates found</p>
            ) : templates.map(t => (
              <div
                key={t.id}
                onClick={() => handleSelectTemplate(t)}
                className={`p-2.5 rounded-lg cursor-pointer border transition-all ${
                  selected?.id === t.id
                    ? 'border-wa-green bg-wa-green/10'
                    : 'border-wa-border/60 hover:border-wa-muted/50 bg-wa-input/40'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-sm font-medium text-wa-text truncate">{t.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {t.header_format && <HeaderIcon format={t.header_format} />}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${t.status === 'APPROVED' ? 'bg-wa-green/10 text-wa-green' : 'bg-orange-500/10 text-orange-400'}`}>
                      {t.status}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-wa-muted line-clamp-2 whitespace-pre-wrap">{getBodyText(t)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Recipients */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-wa-border shrink-0 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-wa-muted uppercase tracking-wider">2 · Add Recipients</p>

            {/* Mode toggle */}
            <div className="flex bg-wa-input rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => inputMode === 'csv' ? switchToTable() : setInputMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${inputMode === 'table' ? 'bg-wa-dark text-wa-text shadow' : 'text-wa-muted hover:text-wa-text'}`}
              >
                <Table2 size={12} /> Fill Table
              </button>
              <button
                onClick={() => inputMode === 'table' ? switchToCsv() : setInputMode('csv')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${inputMode === 'csv' ? 'bg-wa-dark text-wa-text shadow' : 'text-wa-muted hover:text-wa-text'}`}
              >
                <ClipboardPaste size={12} /> Paste CSV
              </button>
            </div>
          </div>

          {inputMode === 'table' ? (
            /* ── TABLE MODE ─────────────────────────────────────────────────── */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {!selected ? (
                <div className="flex-1 flex items-center justify-center text-wa-muted text-sm">
                  Select a template first to see columns
                </div>
              ) : (
                <>
                  {/* Column headers */}
                  <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-wa-border bg-wa-input/30">
                    {colHeaders.map((h, i) => (
                      <div key={i} className={`text-[11px] font-semibold text-wa-muted uppercase tracking-wide ${i === 0 ? 'w-40 shrink-0' : i === colHeaders.length - 1 && hasMedia ? 'flex-1 min-w-0' : 'w-28 shrink-0'}`}>
                        {h}
                      </div>
                    ))}
                    <div className="w-7 shrink-0" />
                  </div>

                  {/* Rows */}
                  <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
                    {rows.map((row, ri) => {
                      const errs = rowErrors[ri] || [];
                      const fieldErr = (field) => errs.find(e => e.field === field);
                      return (
                        <div key={ri} className="flex items-center gap-2">
                          {/* Phone */}
                          <input
                            type="text"
                            value={row.phone}
                            onChange={e => updateCell(ri, 'phone', e.target.value)}
                            placeholder="447700900000"
                            className={`w-40 shrink-0 bg-wa-input text-wa-text text-xs rounded-lg px-2.5 py-2 outline-none font-mono placeholder:text-wa-muted/40 ${fieldErr('phone') && row.phone ? 'ring-1 ring-red-400/60' : 'focus:ring-1 focus:ring-wa-green/30'}`}
                          />
                          {/* Params */}
                          {Array.from({ length: numParams }, (_, pi) => (
                            <input
                              key={pi}
                              type="text"
                              value={row.params[pi] || ''}
                              onChange={e => updateCell(ri, `param_${pi}`, e.target.value)}
                              placeholder={`{{${pi + 1}}}`}
                              className={`w-28 shrink-0 bg-wa-input text-wa-text text-xs rounded-lg px-2.5 py-2 outline-none placeholder:text-wa-muted/40 ${fieldErr(`param_${pi}`) && row.params[pi] !== undefined ? 'ring-1 ring-red-400/60' : 'focus:ring-1 focus:ring-wa-green/30'}`}
                            />
                          ))}
                          {/* Media URL */}
                          {hasMedia && (
                            <input
                              type="url"
                              value={row.mediaUrl}
                              onChange={e => updateCell(ri, 'mediaUrl', e.target.value)}
                              placeholder="https://..."
                              className={`flex-1 min-w-0 bg-wa-input text-wa-text text-xs rounded-lg px-2.5 py-2 outline-none placeholder:text-wa-muted/40 ${fieldErr('mediaUrl') && row.mediaUrl ? 'ring-1 ring-red-400/60' : 'focus:ring-1 focus:ring-wa-green/30'}`}
                            />
                          )}
                          {/* Delete row */}
                          <button
                            onClick={() => removeRow(ri)}
                            disabled={rows.length === 1}
                            className="w-7 shrink-0 flex items-center justify-center text-wa-muted/50 hover:text-red-400 disabled:opacity-20 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}

                    <button
                      onClick={addRow}
                      className="flex items-center gap-1.5 text-xs text-wa-muted hover:text-wa-green transition-colors py-1 mt-1"
                    >
                      <Plus size={13} /> Add Row
                    </button>
                  </div>

                  {/* Inline error summary */}
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
            /* ── CSV MODE ───────────────────────────────────────────────────── */
            <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
              {/* Format hint */}
              <div className="shrink-0 text-[11px] text-wa-muted p-2.5 bg-wa-input/50 rounded-lg leading-relaxed">
                <span className="font-semibold text-wa-text">Format</span> — one row per line, comma-separated, no header row:<br />
                <span className="font-mono text-wa-green">
                  Phone{numParams > 0 ? Array.from({ length: numParams }, (_, i) => `, Param${i + 1}`).join('') : ''}{hasMedia ? `, ${selected.header_format}_URL` : ''}
                </span>
              </div>

              {liveErrors.length > 0 && (
                <div className="shrink-0 px-3 py-2 bg-red-400/5 border border-red-400/20 rounded-lg max-h-24 overflow-y-auto">
                  {liveErrors.map((e, i) => (
                    <p key={i} className="text-[11px] text-red-400">• {e}</p>
                  ))}
                </div>
              )}

              <textarea
                value={csvData}
                onChange={e => setCsvData(e.target.value)}
                placeholder={`447700900000${numParams > 0 ? ', John' : ''}${hasMedia ? ', https://example.com/img.jpg' : ''}\n917898765432${numParams > 0 ? ', Priya' : ''}${hasMedia ? ', https://example.com/img2.jpg' : ''}`}
                className="flex-1 min-h-0 bg-wa-input text-wa-text text-sm rounded-lg px-3 py-2.5 outline-none resize-none placeholder:text-wa-muted/40 focus:ring-1 focus:ring-wa-green/30 font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-t border-wa-border bg-wa-dark flex items-center gap-3">
        <div className="flex-1 text-xs text-wa-muted">
          {inputMode === 'table'
            ? `${rows.filter(r => r.phone.trim()).length} recipient${rows.filter(r => r.phone.trim()).length !== 1 ? 's' : ''} entered`
            : `${csvData.trim().split(/\r?\n/).filter(l => l.trim()).length} line${csvData.trim().split(/\r?\n/).filter(l => l.trim()).length !== 1 ? 's' : ''} pasted`}
        </div>
        <button
          onClick={handlePreview}
          disabled={!canPreview || sending}
          className="flex items-center gap-2 bg-wa-green text-wa-darker font-semibold px-5 py-2.5 rounded-lg hover:bg-wa-green/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
        >
          <Send size={15} />
          Preview & Send
        </button>
      </div>

      {/* ── Preview overlay ──────────────────────────────────────────────────── */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-wa-dark w-full max-w-xl rounded-xl border border-wa-border shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-wa-border flex justify-between items-center shrink-0">
              <h3 className="font-semibold text-wa-text">Preview · {selected?.name}</h3>
              <button onClick={() => setShowPreview(false)}><X size={20} className="text-wa-muted" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Stats */}
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

              {/* Errors */}
              {bulkErrors.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Skipped rows</h4>
                  <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-3 space-y-1 max-h-36 overflow-y-auto">
                    {bulkErrors.map((e, i) => <p key={i} className="text-xs text-red-400">• {e}</p>)}
                  </div>
                </div>
              )}

              {/* Message preview */}
              {bulkRows.length > 0 && (
                <>
                  <h4 className="text-xs font-semibold text-wa-muted uppercase tracking-wider">Message Preview (first recipient)</h4>
                  <div className="bg-wa-incoming/50 rounded-lg p-3 border border-wa-border">
                    {selected?.header_format === 'IMAGE' && bulkRows[0]?.mediaUrl && (
                      <div className="mb-2">
                        <img
                          src={bulkRows[0].mediaUrl}
                          onError={() => setPreviewImageError(true)}
                          onLoad={() => setPreviewImageError(false)}
                          className={`w-full max-h-40 object-cover rounded border border-wa-border/50 bg-black/20 ${previewImageError ? 'hidden' : 'block'}`}
                          alt="Preview"
                        />
                        {previewImageError && (
                          <p className="text-[11px] text-red-400 p-2 bg-red-900/10 border border-red-900/30 rounded">
                            Image URL couldn't load — sending may still work if the URL is valid.
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
              <button
                onClick={() => setShowPreview(false)}
                className="flex-1 py-2.5 text-wa-text hover:bg-wa-hover rounded-lg transition-colors border border-wa-border text-sm"
              >
                Go Back
              </button>
              <button
                onClick={handleSendBulk}
                disabled={bulkRows.length === 0 || sending}
                className="flex-[2] py-2.5 bg-wa-green text-wa-darker font-bold rounded-lg hover:bg-wa-green/90 transition-all disabled:opacity-40 text-sm flex items-center justify-center gap-2"
              >
                <Send size={14} />
                Send to {bulkRows.length} contact{bulkRows.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
