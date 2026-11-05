import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { AuthGate } from './auth/AuthGate.js';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/catalog.css';
import './styles/profiles.css';
import './styles/auth.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <AuthGate>{(_user, account) => <App account={account} />}</AuthGate>
  </StrictMode>,
);
