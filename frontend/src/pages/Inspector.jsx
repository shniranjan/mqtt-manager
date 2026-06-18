import React, { useState } from 'react';
import { api } from '../api/client';

export default function Inspector() {
  const [publishTopic, setPublishTopic] = useState('');
  const [publishPayload, setPublishPayload] = useState('');
  const [publishQos, setPublishQos] = useState(0);
  const [publishRetain, setPublishRetain] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [subscribeTopic, setSubscribeTopic] = useState('');
  const [messages, setMessages] = useState([]);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState(null);

  async function handlePublish() {
    if (!publishTopic.trim()) return;
    setPublishing(true);
    setError(null);
    setPublishResult(null);
    try {
      await api.publishMessage(publishTopic.trim(), publishPayload, publishQos, publishRetain);
      setPublishResult({
        success: true,
        topic: publishTopic,
        time: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  }

  async function handleSubscribe() {
    if (!subscribeTopic.trim()) return;
    setSubscribing(true);

    // Add a simulated subscription entry (MQTT subscription via REST)
    // In production, this would use WebSocket via AuxGate
    setMessages((prev) => [
      { topic: subscribeTopic, payload: '(subscribed — use a real MQTT client to receive)', time: new Date().toLocaleTimeString() },
      ...prev,
    ]);
    setSubscribing(false);
  }

  return (
    <div>
      <div className="page-header">
        <h1>🔍 Topic Inspector</h1>
        <p>Publish test messages and inspect topic activity</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Publish Panel */}
        <div>
          <h3>Publish Message</h3>
          <label>
            Topic
            <input
              type="text"
              value={publishTopic}
              onChange={(e) => setPublishTopic(e.target.value)}
              placeholder="test/hello"
            />
          </label>
          <label>
            Payload
            <textarea
              value={publishPayload}
              onChange={(e) => setPublishPayload(e.target.value)}
              placeholder='{"message": "hello world"}'
              rows={4}
            />
          </label>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <label>
              QoS
              <select value={publishQos} onChange={(e) => setPublishQos(Number(e.target.value))}>
                <option value={0}>0 — At most once</option>
                <option value={1}>1 — At least once</option>
                <option value={2}>2 — Exactly once</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={publishRetain}
                onChange={(e) => setPublishRetain(e.target.checked)}
              />
              {' '}Retain
            </label>
          </div>
          <button onClick={handlePublish} disabled={publishing}>
            {publishing ? 'Publishing...' : 'Publish'}
          </button>

          {publishResult && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--pico-ins-color)', borderRadius: 'var(--pico-border-radius)' }}>
              ✅ Published to <code>{publishResult.topic}</code> at {publishResult.time}
            </div>
          )}
        </div>

        {/* Subscribe Panel */}
        <div>
          <h3>Subscribe (Simulated)</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--pico-muted-color)' }}>
            REST subscription is simulated. For real-time topics, use a WebSocket client through AuxGate.
          </p>
          <label>
            Topic Filter
            <input
              type="text"
              value={subscribeTopic}
              onChange={(e) => setSubscribeTopic(e.target.value)}
              placeholder="sensors/#"
            />
          </label>
          <button onClick={handleSubscribe} disabled={subscribing}>
            {subscribing ? 'Subscribing...' : 'Subscribe'}
          </button>

          {messages.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4>Recent Activity</h4>
              {messages.slice(0, 20).map((m, i) => (
                <div
                  key={i}
                  style={{
                    padding: '0.5rem',
                    marginBottom: '0.25rem',
                    background: 'var(--pico-card-background-color)',
                    border: '1px solid var(--pico-muted-border-color)',
                    borderRadius: 'var(--pico-border-radius)',
                    fontSize: '0.85rem',
                  }}
                >
                  <div><strong>{m.topic}</strong> <span style={{ color: 'var(--pico-muted-color)', fontSize: '0.75rem' }}>{m.time}</span></div>
                  <code style={{ fontSize: '0.8rem' }}>{m.payload}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
