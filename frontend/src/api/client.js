const API_BASE = '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  };

  const res = await fetch(url, config);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

export const api = {
  // Health
  health: () => request('/health'),

  // Broker
  getBrokerStatus: () => request('/broker/status'),
  getBrokerConfig: () => request('/broker/config'),
  updateBrokerConfig: (content) =>
    request('/broker/config', { method: 'POST', body: JSON.stringify({ content }) }),

  // Topics
  getTopics: () => request('/topics'),
  inspectTopic: (topic) => request(`/topics/${encodeURIComponent(topic)}/inspect`),
  publishMessage: (topic, payload, qos = 0, retain = false) =>
    request('/topics/publish', {
      method: 'POST',
      body: JSON.stringify({ topic, payload, qos, retain }),
    }),

  // Clients
  getClients: () => request('/clients'),

  // Users
  getUsers: () => request('/users'),
  createUser: (username, password) =>
    request('/users', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  deleteUser: (username) =>
    request(`/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),

  // ACL
  getAcl: () => request('/acl'),
  createAclRule: (user, topic, access) =>
    request('/acl', {
      method: 'POST',
      body: JSON.stringify({ user, topic, access }),
    }),
  deleteAclRule: (id) => request(`/acl/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
