import { describe, expect, it } from 'vitest';
import { rememberProfileId, rememberedProfileId } from './active-profile.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: () => null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

const broken = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
} as unknown as Storage;

describe('active profile storage', () => {
  it('remembers the picked profile', () => {
    const storage = memoryStorage();

    expect(rememberedProfileId(storage)).toBeNull();
    rememberProfileId('kid', storage);

    expect(rememberedProfileId(storage)).toBe('kid');
  });

  it('survives a storage that throws or is missing', () => {
    expect(() => rememberProfileId('kid', broken)).not.toThrow();
    expect(rememberedProfileId(broken)).toBeNull();
    expect(rememberedProfileId(undefined)).toBeNull();
  });
});
