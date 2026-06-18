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

export default function Clients() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);

  useEffect(() => {
    loadClients();
    const interval = setInterval(loadClients, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadClients() {
    try {
      const data = await api.getClients();
      setClients(data || []);
      setError(null);
    } catch (err) {
      // Don't overwrite data on poll error
      if (clients.length === 0) setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="page-header">
        <h1>💻 Connected Clients</h1>
        <p>Real-time view of clients connected to the broker (refreshes every 10s)</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Client ID</th>
              <th>Status</th>
              <th>IP Address</th>
              <th>Protocol</th>
              <th>Connected At</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--pico-muted-color)' }}>
                  No connected clients
                </td>
              </tr>
            ) : (
              clients.map((c, i) => (
                <tr key={i}>
                  <td><strong>{c.client_id}</strong></td>
                  <td>
                    <span className={`status-badge ${c.connected ? 'status-online' : 'status-offline'}`}>
                      {c.connected ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td><code>{c.ip_address || '—'}</code></td>
                  <td>{c.protocol || '—'}</td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--pico-muted-color)' }}>
                    {c.connected_at || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--pico-muted-color)' }}>
        Client data comes from Mosquitto $SYS topics. Ensure <code>sys_interval</code> is set in mosquitto.conf.
      </p>
    </div>
  );
}
