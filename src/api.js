const ENV_URL = import.meta.env.VITE_API_URL || '';
const API_URL = ENV_URL.startsWith('http') ? ENV_URL : (ENV_URL ? `https://${ENV_URL}` : 'https://managing-selia-asaaye-fe641587.koyeb.app');
const API_KEY = import.meta.env.VITE_API_KEY || '';

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY, ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res.json();
}

export const api = {
  getConversations: (search = '') =>
    request(`/api/conversations?search=${encodeURIComponent(search)}`),

  deleteConversation: (id) => 
    request(`/api/conversations/${id}`, { method: 'DELETE' }),

  updateContactName: (id, name) =>
    request(`/api/conversations/${id}/contact`, { 
      method: 'PATCH', 
      body: JSON.stringify({ name }) 
    }),

  getMessages: (conversationId, limit = 50, offset = 0) =>
    request(`/api/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`),

  sendText: (phone, message, contactName = null) =>
    request('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({ phone, message, contact_name: contactName }),
    }),

  sendTemplate: (data) =>
    request('/api/messages/send-template', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getTemplates: () => request('/api/templates'),

  deleteMessage: (messageId) => 
    request(`/api/messages/${messageId}`, { method: 'DELETE' }),

  markAsRead: (conversationId) =>
    request(`/api/conversations/${conversationId}/read`, { method: 'POST' }),

  getAnalyticsSummary: () => request('/api/analytics/summary'),
  getDailyAnalytics: (days = 30) => request(`/api/analytics/daily?days=${days}`),
  getSystemAlerts: () => request('/api/analytics/alerts'),
};
