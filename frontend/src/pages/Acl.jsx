import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

function Spinner() {
  return (
    <div className="loading-container">
      <div className="spinner" />
      <span>Loading...</span>
    </div>
  );
}

export default function Acl() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rules, setRules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [user, setUser] = useState('');
  const [topic, setTopic] = useState('');
  const [access, setAccess] = useState('read');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAcl();
      setRules(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!user.trim() || !topic.trim()) return;
    setSubmitting(true);
    try {
      await api.createAclRule(user.trim(), topic.trim(), access);
      setShowForm(false);
      setUser('');
      setTopic('');
      setAccess('read');
      await loadRules();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this ACL rule?')) return;
    try {
      await api.deleteAclRule(id);
      await loadRules();
    } catch (err) {
      setError(err.message);
    }
  }

  function getAccessBadge(a) {
    const colors = {
      read: '#0969da',
      write: '#bf8700',
      readwrite: '#8250df',
    };
    return (
      <span
        className="status-badge"
        style={{ background: colors[a] || '#666', color: '#fff' }}
      >
        {a}
      </span>
    );
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="page-header">
        <h1>🔒 ACL Rules</h1>
        <p>Topic-level publish/subscribe access control</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <button onClick={() => setShowForm(!showForm)} style={{ marginBottom: '1rem' }}>
        {showForm ? 'Cancel' : '+ Add Rule'}
      </button>

      {showForm && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--pico-muted-border-color)', borderRadius: 'var(--pico-border-radius)' }}>
          <h4>New ACL Rule</h4>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
            <label>
              User
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="sensor-01"
              />
            </label>
            <label>
              Topic
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="sensors/#"
              />
            </label>
            <label>
              Access
              <select value={access} onChange={(e) => setAccess(e.target.value)}>
                <option value="read">Read (Subscribe)</option>
                <option value="write">Write (Publish)</option>
                <option value="readwrite">Read & Write</option>
              </select>
            </label>
            <button onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Rule'}
            </button>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Topic</th>
              <th>Access</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--pico-muted-color)' }}>
                  No ACL rules configured
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.user}</strong></td>
                  <td><code>{r.topic}</code></td>
                  <td>{getAccessBadge(r.access)}</td>
                  <td>
                    <button
                      className="secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => handleDelete(r.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
