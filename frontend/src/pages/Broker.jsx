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

export default function Broker() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [config, setConfig] = useState('');
  const [editing, setEditing] = useState(false);
  const [configDraft, setConfigDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [statusData, configText] = await Promise.all([
        api.getBrokerStatus(),
        api.getBrokerConfig(),
      ]);
      setMetrics(statusData || {});
      setConfig(typeof configText === 'string' ? configText : '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    try {
      await api.updateBrokerConfig(configDraft);
      setConfig(configDraft);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditing() {
    setConfigDraft(config);
    setEditing(true);
  }

  const metricKeys = Object.keys(metrics);
  const displayMetrics = metricKeys.length > 0
    ? metricKeys.slice(0, 12).map((k) => ({
        label: k.replace('$SYS/broker/', '').replace(/\//g, ' › '),
        value: metrics[k],
      }))
    : [
        { label: 'Version', value: 'N/A' },
        { label: 'Uptime', value: 'N/A' },
        { label: 'Connected Clients', value: '0' },
        { label: 'Messages Stored', value: '0' },
        { label: 'Messages Sent', value: '0' },
        { label: 'Messages Received', value: '0' },
      ];

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="page-header">
        <h1>📡 Broker Status</h1>
        <p>Mosquitto broker metrics and configuration</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="metric-grid">
        {displayMetrics.map((m, i) => (
          <div key={i} className="metric-card">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value">{m.value}</div>
          </div>
        ))}
      </div>

      <h3>Configuration</h3>
      {editing ? (
        <div>
          <textarea
            style={{ width: '100%', minHeight: '300px', fontFamily: 'monospace', fontSize: '0.85rem' }}
            value={configDraft}
            onChange={(e) => setConfigDraft(e.target.value)}
          />
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <button onClick={saveConfig} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Reload'}
            </button>
            <button
              className="secondary"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <pre style={{ maxHeight: '400px', overflow: 'auto', background: 'var(--pico-code-background-color)', padding: '1rem', borderRadius: 'var(--pico-border-radius)', fontSize: '0.85rem' }}>
            {config || '# No configuration loaded'}
          </pre>
          <button onClick={startEditing} style={{ marginTop: '0.5rem' }}>
            Edit Configuration
          </button>
        </div>
      )}
    </div>
  );
}
