import React, { useState } from 'react';
import Broker from './pages/Broker';
import Users from './pages/Users';
import Acl from './pages/Acl';
import Topics from './pages/Topics';
import Clients from './pages/Clients';
import Inspector from './pages/Inspector';

const TABS = [
  { id: 'broker', label: 'Broker', icon: '📡' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'acl', label: 'ACL', icon: '🔒' },
  { id: 'topics', label: 'Topics', icon: '📂' },
  { id: 'clients', label: 'Clients', icon: '💻' },
  { id: 'inspector', label: 'Inspector', icon: '🔍' },
];

function Sidebar({ activeTab, onTabChange }) {
  return (
    <aside className="sidebar">
      <h2>⚡ MQTT Manager</h2>
      <nav>
        {TABS.map((tab) => (
          <a
            key={tab.id}
            href="#"
            className={activeTab === tab.id ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              onTabChange(tab.id);
            }}
          >
            <span style={{ marginRight: '0.5rem' }}>{tab.icon}</span>
            {tab.label}
          </a>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: '1rem', fontSize: '0.75rem', color: 'var(--pico-muted-color)' }}>
        v0.1.0 &mdash; AGPLv3
      </div>
    </aside>
  );
}

function PageContent({ activeTab }) {
  switch (activeTab) {
    case 'broker':
      return <Broker />;
    case 'users':
      return <Users />;
    case 'acl':
      return <Acl />;
    case 'topics':
      return <Topics />;
    case 'clients':
      return <Clients />;
    case 'inspector':
      return <Inspector />;
    default:
      return <Broker />;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('broker');

  return (
    <div className="app-layout">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="main-content">
        <PageContent activeTab={activeTab} />
      </main>
    </div>
  );
}
