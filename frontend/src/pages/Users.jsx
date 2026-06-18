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

export default function Users() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getUsers();
      setUsers(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!username.trim() || !password.trim()) return;
    setSubmitting(true);
    try {
      await api.createUser(username.trim(), password);
      setShowForm(false);
      setUsername('');
      setPassword('');
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(user) {
    if (!confirm(`Delete user "${user}"?`)) return;
    try {
      await api.deleteUser(user);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="page-header">
        <h1>👥 Users</h1>
        <p>Manage MQTT broker user accounts and passwords</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <button onClick={() => setShowForm(!showForm)} style={{ marginBottom: '1rem' }}>
        {showForm ? 'Cancel' : '+ Add User'}
      </button>

      {showForm && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--pico-muted-border-color)', borderRadius: 'var(--pico-border-radius)' }}>
          <h4>New User</h4>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap' }}>
            <label>
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sensor-01"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            <button onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Password Hash</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--pico-muted-color)' }}>
                  No users configured
                </td>
              </tr>
            ) : (
              users.map((u, i) => (
                <tr key={i}>
                  <td><strong>{u.username}</strong></td>
                  <td><code>{u.password || '••••••••'}</code></td>
                  <td>
                    <button
                      className="secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => handleDelete(u.username)}
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
