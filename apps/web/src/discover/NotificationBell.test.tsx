import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification, NotificationList } from '@popcorntv/shared';
import { NOTIFICATION_POLL_MS, NotificationBell, notificationText } from './NotificationBell.js';

function note(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 1,
    kind: 'movie',
    tmdbId: 438631,
    title: 'Dune',
    reason: 'provider',
    providerId: 8,
    providerName: 'Netflix',
    createdAt: '2026-11-10T00:00:00.000Z',
    readAt: null,
    ...overrides,
  };
}

function makeApi(list: NotificationList, ok = true) {
  return { load: vi.fn(async () => list), markRead: vi.fn(async () => ok) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('notificationText', () => {
  it.each([
    [note(), 'Dune is now on Netflix'],
    [
      note({ reason: 'library', providerId: null, providerName: null }),
      'Dune is now in your library',
    ],
    [note({ providerName: null }), 'Dune is now on one of your providers'],
  ])('says %#', (item, text) => {
    expect(notificationText(item)).toBe(text);
  });
});

describe('NotificationBell', () => {
  it('shows the unread count, lists the lines on open and marks them read', async () => {
    const user = userEvent.setup();
    const api = makeApi({
      items: [note(), note({ id: 2, title: 'Heat', readAt: 'x' })],
      unread: 1,
    });
    render(<NotificationBell profileId="p1" api={api} onOpen={vi.fn()} />);

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bell);

    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Dune is now on Netflix' })).toHaveClass(
      'bell__item--new',
    );
    expect(screen.getByRole('button', { name: 'Heat is now on Netflix' })).not.toHaveClass(
      'bell__item--new',
    );
    expect(api.markRead).toHaveBeenCalledWith('p1');
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('keeps the count when marking read is refused', async () => {
    const user = userEvent.setup();
    const api = makeApi({ items: [note()], unread: 1 }, false);
    render(<NotificationBell profileId="p1" api={api} onOpen={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    expect(screen.getByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
  });

  it('says nothing is new and does not mark read on an empty list', async () => {
    const user = userEvent.setup();
    const api = makeApi({ items: [], unread: 0 });
    render(<NotificationBell profileId="p1" api={api} onOpen={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByText('Nothing new on your list.')).toBeInTheDocument();
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it('opens a line’s title and closes the panel', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const item = note();
    render(
      <NotificationBell
        profileId="p1"
        api={makeApi({ items: [item], unread: 0 })}
        onOpen={onOpen}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByRole('button', { name: 'Dune is now on Netflix' }));

    expect(onOpen).toHaveBeenCalledWith(item);
    expect(screen.queryByRole('button', { name: 'Dune is now on Netflix' })).toBeNull();
  });

  it('closes on Escape and restores focus from a notification to the bell', async () => {
    const user = userEvent.setup();
    const api = makeApi({ items: [note({ readAt: '2026-11-20T00:00:00Z' })], unread: 0 });
    render(<NotificationBell profileId="p1" api={api} onOpen={vi.fn()} />);

    const bell = screen.getByRole('button', { name: 'Notifications' });
    await user.click(bell);
    const item = await screen.findByRole('button', { name: 'Dune is now on Netflix' });
    await user.tab();
    expect(item).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(bell).toHaveAttribute('aria-expanded', 'false');
    expect(item).not.toBeVisible();
    expect(bell).toHaveFocus();
  });

  it('closes on a pointer press outside without taking focus from the target', async () => {
    const user = userEvent.setup();
    const api = makeApi({ items: [], unread: 0 });
    render(
      <>
        <NotificationBell profileId="p1" api={api} onOpen={vi.fn()} />
        <button type="button">Outside</button>
      </>,
    );

    const bell = screen.getByRole('button', { name: 'Notifications' });
    await user.click(bell);
    const outside = screen.getByRole('button', { name: 'Outside' });
    await user.pointer({ keys: '[MouseLeft>]', target: outside });

    expect(bell).toHaveAttribute('aria-expanded', 'false');
    expect(outside).toHaveFocus();
    await user.pointer('[/MouseLeft]');
  });

  it('leaves focus alone when Escape is pressed with the panel closed', async () => {
    const user = userEvent.setup();
    const api = makeApi({ items: [], unread: 0 });
    render(
      <>
        <NotificationBell profileId="p1" api={api} onOpen={vi.fn()} />
        <button type="button">Outside</button>
      </>,
    );
    const outside = screen.getByRole('button', { name: 'Outside' });
    await user.click(outside);
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(outside).toHaveFocus();
  });

  it('leaves Escape to an open dialog above the panel', async () => {
    const user = userEvent.setup();
    const api = makeApi({ items: [], unread: 0 });
    render(
      <>
        <NotificationBell profileId="p1" api={api} onOpen={vi.fn()} />
        <dialog open>
          <button type="button">Dialog action</button>
        </dialog>
      </>,
    );

    const bell = screen.getByRole('button', { name: 'Notifications' });
    await user.click(bell);
    const action = screen.getByRole('button', { name: 'Dialog action' });
    action.focus();
    await user.keyboard('{Escape}');

    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(action).toHaveFocus();
  });

  it('polls every five minutes and survives a failed poll', async () => {
    vi.useFakeTimers();
    const api = makeApi({ items: [], unread: 0 });
    api.load.mockRejectedValueOnce(new Error('offline'));
    render(<NotificationBell profileId="p1" api={api} onOpen={vi.fn()} />);
    await act(async () => {});
    expect(api.load).toHaveBeenCalledTimes(1);

    api.load.mockResolvedValueOnce({ items: [note()], unread: 3 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATION_POLL_MS);
    });

    expect(api.load).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
  });
});
