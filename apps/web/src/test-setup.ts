import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetHistoryLayers } from './history-layer.js';

afterEach(() => {
  cleanup();
  // Each test starts on a catalog entry with no layer left over (#169).
  resetHistoryLayers();
  history.replaceState(null, '');
});

// jsdom has no modal dialog support: emulate the two methods the detail dialog uses.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.open = true;
};
// Like a browser, `close` is fired as a separate task, after `open` turned false (#169).
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (!this.open) return;
  this.open = false;
  setTimeout(() => this.dispatchEvent(new Event('close')), 0);
};
