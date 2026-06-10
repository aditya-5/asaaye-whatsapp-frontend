import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Zap, Loader, Trash2, ChevronRight, CheckCircle, XCircle, Clock, BarChart2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../api';
import BulkSendModal from '../components/BulkSendModal';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
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

// ── Campaign list card ─────────────────────────────────────────────────────────

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

// ── Main CampaignsPage ─────────────────────────────────────────────────────────

export default function CampaignsPage({ onBack }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bulkSendCampaign, setBulkSendCampaign] = useState(null); // campaign object or {} for new

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

  const handleBulkSendClose = () => {
    setBulkSendCampaign(null);
    load(); // refresh list in case something changed
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-wa-dark" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
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
          onClick={() => setBulkSendCampaign({ name: '', status: 'draft' })}
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
            <p className="text-xs mt-1">Tap New to create your first campaign</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {campaigns.map(c => (
              <CampaignCard
                key={c.id}
                campaign={c}
                onSelect={campaign => setBulkSendCampaign(campaign)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* BulkSendModal overlay */}
      {bulkSendCampaign && (
        <BulkSendModal
          campaign={bulkSendCampaign}
          onClose={handleBulkSendClose}
        />
      )}
    </div>
  );
}
