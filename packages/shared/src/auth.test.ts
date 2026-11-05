import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX, PASSWORD_MIN, ROLES, USERNAME_PATTERN } from './auth.js';

describe('account contracts', () => {
  it.each([
    ['owner', true],
    ['a.b_c-9', true],
    ['ab', false],
    ['x'.repeat(33), false],
    ['with space', false],
    ['élodie', false],
  ])('USERNAME_PATTERN accepts %j: %s', (username, valid) => {
    expect(USERNAME_PATTERN.test(username)).toBe(valid);
  });

  it('bounds passwords and lists the roles', () => {
    expect([PASSWORD_MIN, PASSWORD_MAX]).toEqual([12, 128]);
    expect(ROLES).toEqual(['owner', 'viewer']);
  });
});
