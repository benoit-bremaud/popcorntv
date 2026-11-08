import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RedeemForm } from './RedeemForm.js';
import { SetupForm } from './SetupForm.js';
import { SignInForm } from './SignInForm.js';

// #168: the name fields opt out of autofill; the credential fields must keep their tokens.
describe('credential fields keep their autocomplete tokens (#168)', () => {
  it('sign-in offers the saved username and current password', () => {
    render(<SignInForm onSignedIn={vi.fn()} signIn={vi.fn()} />);

    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('setup offers a new password and keeps the one-time token out of autofill', () => {
    render(<SetupForm onSignedIn={vi.fn()} setUp={vi.fn()} initialToken="" />);

    expect(screen.getByLabelText('Setup token')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('autocomplete', 'new-password');
  });

  it('an invite link offers the saved username', () => {
    render(
      <RedeemForm
        kind="invite"
        token="t"
        redeem={vi.fn()}
        onSignedIn={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
  });

  it.each(['invite', 'reset'] as const)('a %s link offers a new password', (kind) => {
    const { container } = render(
      <RedeemForm kind={kind} token="t" redeem={vi.fn()} onSignedIn={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(container.querySelector('input[type="password"]')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });
});
