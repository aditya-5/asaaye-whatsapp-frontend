import { useState, useEffect } from 'react';
import { ShieldAlert, Send, CheckCheck, Eye, AlertTriangle, ArrowDownToLine, ArrowLeft, Clock, MessageCircle, BarChart3, Zap, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../api';

export default function AnalyticsPage({ onBack }) {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quickReplies, setQuickReplies] = useState([]);
  const [qrTitle, setQrTitle] = useState('');
  const [qrBody, setQrBody] = useState('');
  const [qrSaving, setQrSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getAnalyticsSummary(),
      api.getSystemAlerts().catch(() => []),
      api.getQuickReplies().catch(() => []),
    ])
      .then(([s, a, qr]) => {
        setSummary(s);
        setAlerts(a);
        setQuickReplies(qr);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAddQR = async () => {
    if (!qrTitle.trim() || !qrBody.trim()) return;
    setQrSaving(true);
    try {
      const qr = await api.createQuickReply(qrTitle.trim(), qrBody.trim());
      setQuickReplies(prev => [...prev, qr]);
      setQrTitle(''); setQrBody('');
    } catch { toast.error('Failed to add quick reply'); }
    finally { setQrSaving(false); }
  };

  const handleDeleteQR = async (id) => {
    try {
      await api.deleteQuickReply(id);
      setQuickReplies(prev => prev.filter(qr => qr.id !== id));
    } catch { toast.error('Failed to delete quick reply'); }
  };

  const StatCard = ({ icon: Icon, label, value, color }) => (
    <div className="bg-wa-sidebar rounded-xl p-4 border border-wa-border flex flex-col justify-between shadow-sm">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-2xl font-bold text-wa-text tracking-tight">{value ?? '—'}</p>
        <p className="text-[11px] text-wa-muted font-semibold uppercase tracking-wider mt-1" style={{lineHeight: 1.2}}>{label}</p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-wa-chat">
        <div className="text-wa-muted">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-wa-chat overflow-y-auto">
      <div className="max-w-5xl mx-auto p-8">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-wa-hover transition-colors">
            <ArrowLeft size={20} className="text-wa-muted" />
          </button>
          <BarChart3 size={28} className="text-wa-green" />
          <h1 className="text-2xl font-bold text-wa-text">Analytics & Settings</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-10">
          <StatCard icon={Send} label="Sent" value={summary?.total_sent} color="bg-blue-500/20 text-blue-400" />
          <StatCard icon={CheckCheck} label="Delivered" value={summary?.total_delivered} color="bg-emerald-500/20 text-emerald-400" />
          <StatCard icon={Eye} label="Read" value={summary?.total_read} color="bg-cyan-500/20 text-cyan-400" />
          <StatCard icon={AlertTriangle} label="Failed" value={summary?.total_failed} color="bg-red-500/20 text-red-400" />
          <StatCard icon={ArrowDownToLine} label="Inbound" value={summary?.total_inbound} color="bg-purple-500/20 text-purple-400" />
          <StatCard icon={Clock} label="Active 24H Windows" value={summary?.active_windows} color="bg-wa-green/20 text-wa-green" />
          <StatCard icon={MessageCircle} label={summary?.tier_name === "UNLIMITED" ? "Month Convos Sent" : "Tier Convos Left"} value={summary ? (summary.tier_limit === -1 ? summary.monthly_conversations : Math.max(0, summary.tier_limit - summary.monthly_conversations)) : null} color="bg-orange-500/20 text-orange-400" />
        </div>

        {/* Quick Replies */}
        <div className="bg-wa-sidebar rounded-xl border border-wa-border p-6 shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-5">
            <Zap size={20} className="text-wa-green" />
            <h2 className="text-lg font-semibold text-wa-text">Quick Replies</h2>
            <span className="text-xs text-wa-muted">({quickReplies.length})</span>
          </div>

          {/* Add form */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 mb-4">
            <input
              type="text"
              value={qrTitle}
              onChange={e => setQrTitle(e.target.value)}
              placeholder="Title (e.g. greeting)"
              className="bg-wa-dark border border-wa-border text-wa-text text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-wa-green/30 placeholder:text-wa-muted"
            />
            <input
              type="text"
              value={qrBody}
              onChange={e => setQrBody(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddQR()}
              placeholder="Message text..."
              className="bg-wa-dark border border-wa-border text-wa-text text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-wa-green/30 placeholder:text-wa-muted"
            />
            <button
              onClick={handleAddQR}
              disabled={!qrTitle.trim() || !qrBody.trim() || qrSaving}
              className="flex items-center gap-1.5 bg-wa-green text-wa-darker px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-wa-green/90 transition-colors"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {/* List */}
          {quickReplies.length === 0 ? (
            <div className="text-center text-wa-muted text-sm py-6 bg-wa-dark rounded-lg border border-wa-border/50">
              No quick replies yet. Add one above — trigger with / in chat.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {quickReplies.map(qr => (
                <div key={qr.id} className="flex items-start gap-3 bg-wa-dark rounded-lg px-4 py-3 border border-wa-border/50 group">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-wa-green mb-0.5">/{qr.title}</div>
                    <div className="text-xs text-wa-muted truncate">{qr.body}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteQR(qr.id)}
                    className="text-wa-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin Hub */}
        <div className="bg-wa-sidebar rounded-xl border border-wa-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <ShieldAlert size={20} className="text-wa-green" />
            <h2 className="text-lg font-semibold text-wa-text">Admin Webhook Alerts</h2>
          </div>
          
          {alerts.length === 0 ? (
            <div className="text-center text-wa-muted py-8 bg-wa-dark rounded-lg border border-wa-border/50">
              No webhook alerts recorded yet. Ensure webhooks are enabled in your Meta Dashboard.
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 hidden-scrollbar">
              {alerts.map((alert) => (
                <div key={alert.id} className="bg-wa-dark rounded-lg p-4 border border-wa-border/50 flex flex-col gap-2">
                  <div className="flex items-start justify-between">
                    <h3 className="text-sm font-semibold text-wa-text">{alert.title}</h3>
                    <span className="text-[10px] text-wa-muted bg-wa-input px-2 py-1 rounded">
                      {new Date(alert.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-wa-muted font-mono bg-wa-input/50 p-2 rounded break-all whitespace-pre-wrap">
                    {alert.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
