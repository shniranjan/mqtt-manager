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

export default function Topics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectData, setInspectData] = useState(null);

  useEffect(() => {
    loadTopics();
  }, []);

  async function loadTopics() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getTopics();
      setTopics(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function inspectTopic(topic) {
    setSelectedTopic(topic);
    setInspecting(true);
    setInspectData(null);
    try {
      const data = await api.inspectTopic(topic);
      setInspectData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setInspecting(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="page-header">
        <h1>📂 Topics</h1>
        <p>Browse and inspect MQTT topic tree</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Topic</th>
              <th>Message Count</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {topics.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--pico-muted-color)' }}>
                  No topics discovered. Ensure Mosquitto $SYS topics are enabled and the broker has traffic.
                </td>
              </tr>
            ) : (
              topics.map((t, i) => (
                <tr key={i} className={selectedTopic === t.topic ? '' : 'clickable-row'} onClick={() => inspectTopic(t.topic)}>
                  <td><code>{t.topic}</code></td>
                  <td>{t.message_count.toLocaleString()}</td>
                  <td>
                    <button
                      className="secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={(e) => { e.stopPropagation(); inspectTopic(t.topic); }}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Topic Inspector Drawer */}
      {selectedTopic && (
        <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid var(--pico-primary)', borderRadius: 'var(--pico-border-radius)' }}>
          <h3>
            Inspecting: <code>{selectedTopic}</code>
            <button
              className="secondary"
              style={{ float: 'right', padding: '0.25rem 0.5rem' }}
              onClick={() => { setSelectedTopic(null); setInspectData(null); }}
            >
              Close
            </button>
          </h3>

          {inspecting ? (
            <Spinner />
          ) : inspectData ? (
            <div>
              <h4>Retained Message</h4>
              <div className="json-viewer">
                {inspectData.retained_message || '(none)'}
              </div>

              {inspectData.stats && Object.keys(inspectData.stats).length > 0 && (
                <>
                  <h4 style={{ marginTop: '1rem' }}>Stats</h4>
                  <div className="json-viewer">
                    {JSON.stringify(inspectData.stats, null, 2)}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
