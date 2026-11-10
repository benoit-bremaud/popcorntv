import { describe, expect, it } from 'vitest';
import { languageLabel } from './language.js';

describe('languageLabel (issue #260)', () => {
  it('maps ISO 639-2 codes to readable language names', () => {
    expect(languageLabel('ger')).toBe('Deutsch');
    expect(languageLabel('eng')).toBe('English');
    expect(languageLabel('spa')).toBe('Español');
    expect(languageLabel('fre')).toBe('Français');
    expect(languageLabel('fra')).toBe('Français');
    expect(languageLabel('ita')).toBe('Italiano');
    expect(languageLabel('dut')).toBe('Nederlands');
    expect(languageLabel('nld')).toBe('Nederlands');
    expect(languageLabel('pol')).toBe('Polski');
    expect(languageLabel('por')).toBe('Português');
    expect(languageLabel('rus')).toBe('Русский');
    expect(languageLabel('vie')).toBe('Tiếng Việt');
  });

  it('maps ISO 639-1 two-letter codes to readable language names', () => {
    expect(languageLabel('de')).toBe('Deutsch');
    expect(languageLabel('en')).toBe('English');
    expect(languageLabel('fr')).toBe('Français');
    expect(languageLabel('es')).toBe('Español');
    expect(languageLabel('it')).toBe('Italiano');
  });

  it('falls back to the code when the language is undetermined or unknown', () => {
    expect(languageLabel('und')).toBe('und');
    expect(languageLabel('qaa')).toBe('qaa');
    expect(languageLabel('xyz123')).toBe('xyz123');
  });

  it('returns null for null, undefined, or empty code', () => {
    expect(languageLabel(null)).toBeNull();
    expect(languageLabel(undefined)).toBeNull();
    expect(languageLabel('')).toBeNull();
    expect(languageLabel('   ')).toBeNull();
  });
});
