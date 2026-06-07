const ENV_URL = import.meta.env.VITE_API_URL || '';
const API_URL = ENV_URL.startsWith('http') ? ENV_URL : (ENV_URL ? `https://${ENV_URL}` : 'https://managing-selia-asaaye-fe641587.koyeb.app');
const API_KEY = import.meta.env.VITE_API_KEY || '';

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY, ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { msg = JSON.parse(text)?.detail || text; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  // Conversations
  getConversations: (search = '', status = '') =>
    request(`/api/conversations?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`),
  deleteConversation: (id) => request(`/api/conversations/${id}`, { method: 'DELETE' }),
  updateContactName: (id, name) =>
    request(`/api/conversations/${id}/contact`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  markAsRead: (id) => request(`/api/conversations/${id}/read`, { method: 'POST' }),
  updateStatus: (id, status) =>
    request(`/api/conversations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  updateLabels: (id, labels) =>
    request(`/api/conversations/${id}/labels`, { method: 'PATCH', body: JSON.stringify({ labels }) }),

  // Messages
  getMessages: (conversationId, limit = 50, offset = 0) =>
    request(`/api/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`),
  sendText: (phone, message, contactName = null, replyToWamid = null) =>
    request('/api/messages/send', { method: 'POST', body: JSON.stringify({ phone, message, contact_name: contactName, reply_to_wamid: replyToWamid }) }),
  sendTemplate: (data) => request('/api/messages/send-template', { method: 'POST', body: JSON.stringify(data) }),
  sendMedia: (data) => request('/api/messages/send-media', { method: 'POST', body: JSON.stringify(data) }),
  deleteMessage: (messageId) => request(`/api/messages/${messageId}`, { method: 'DELETE' }),
  reactToMessage: (messageId, emoji) =>
    request(`/api/messages/${messageId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),

  // Templates
  getTemplates: () => request('/api/templates'),

  // Notes
  getNotes: (conversationId) => request(`/api/conversations/${conversationId}/notes`),
  createNote: (conversationId, content) =>
    request(`/api/conversations/${conversationId}/notes`, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteNote: (conversationId, noteId) =>
    request(`/api/conversations/${conversationId}/notes/${noteId}`, { method: 'DELETE' }),

  // Reminders
  getReminder: (conversationId) => request(`/api/conversations/${conversationId}/reminder`),
  setReminder: (conversationId, remind_at, note = null) =>
    request(`/api/conversations/${conversationId}/reminder`, { method: 'POST', body: JSON.stringify({ remind_at, note }) }),
  clearReminder: (conversationId) =>
    request(`/api/conversations/${conversationId}/reminder`, { method: 'DELETE' }),

  // Quick replies
  getQuickReplies: () => request('/api/quick-replies'),
  createQuickReply: (title, body) =>
    request('/api/quick-replies', { method: 'POST', body: JSON.stringify({ title, body }) }),
  deleteQuickReply: (id) => request(`/api/quick-replies/${id}`, { method: 'DELETE' }),

  // Media (S3 presign)
  presignUpload: (filename, content_type) =>
    request('/api/media/presign', { method: 'POST', body: JSON.stringify({ filename, content_type }) }),

  // Notion
  getNotionContacts: (segment = '', search = '') =>
    request(`/api/notion/contacts?segment=${encodeURIComponent(segment)}&search=${encodeURIComponent(search)}`),
  createNotionContact: (phone, name = '', segments = ['WhatsApp Initiated']) =>
    request('/api/notion/contacts', { method: 'POST', body: JSON.stringify({ phone, name: name || phone, segments }) }),
  blastTemplate: (data) => request('/api/notion/blast', { method: 'POST', body: JSON.stringify(data) }),

  // Analytics
  getAnalyticsSummary: () => request('/api/analytics/summary'),
  getDailyAnalytics: (days = 30) => request(`/api/analytics/daily?days=${days}`),
  getSystemAlerts: () => request('/api/analytics/alerts'),
};
