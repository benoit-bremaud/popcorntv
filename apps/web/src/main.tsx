import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { AuthGate } from './auth/AuthGate.js';
import { leaveStaleLayers } from './history-layer.js';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/catalog.css';
import './styles/discover.css';
import './styles/profiles.css';
import './styles/auth.css';
import './styles/admin.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Missing #root element');
}

// A reload on a dialog's entry lands on the catalog (spec history-back R6).
leaveStaleLayers();

createRoot(root).render(
  <StrictMode>
    <AuthGate>
      {(_user, account, openAdmin) => <App account={account} onAddLibrary={openAdmin} />}
    </AuthGate>
  </StrictMode>,
);
