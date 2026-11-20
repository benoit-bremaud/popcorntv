import { expect, test, type Locator, type Page } from '@playwright/test';
import type {
  Account,
  AuthStatus,
  Library,
  Media,
  MediaFolderList,
  NotificationList,
  Profile,
  User,
} from '@popcorntv/shared';

// The API is mocked at the network layer: the smoke checks the built page, not the server.
const LIBRARY = {
  id: 'lib-1',
  name: 'Films',
  rootPath: '/media/films',
  kind: 'films',
} satisfies Library;
const META = {
  tmdbId: 1,
  overview: 'A synopsis.',
  releaseDate: null,
  runtimeMin: 120,
  voteCount: 10,
  cast: [],
  posterPath: null,
  backdropPath: null,
  fetchedAt: '2026-10-23T00:00:00.000Z',
};
const TITLES: readonly { id: string; title: string; genre: string; voteAverage: number }[] = [
  { id: 'heat', title: 'Heat', genre: 'Action', voteAverage: 8.3 },
  { id: 'alien', title: 'Alien', genre: 'Science Fiction', voteAverage: 8.1 },
];
const MEDIA = TITLES.map(({ id, title, genre, voteAverage }, index) => ({
  id,
  libraryId: 'lib-1',
  kind: 'film',
  title,
  year: null,
  relativePath: `${title}.mkv`,
  durationSec: 100,
  season: null,
  episode: null,
  episodeEnd: null,
  seriesId: null,
  providerIds: {},
  edition: null,
  part: null,
  streams: [],
  metadata: { ...META, tmdbId: index + 1, genres: [{ id: index + 1, name: genre }], voteAverage },
})) satisfies Media[];

const PROFILE = { id: 'default', name: 'Me', avatar: 'red' } satisfies Profile;
const OWNER = { id: 'u1', username: 'owner', role: 'owner' } satisfies User;
const EMPTY_NOTIFICATIONS: NotificationList = { items: [], unread: 0 };

async function openCatalog(
  page: Page,
  notifications = EMPTY_NOTIFICATIONS,
  user: User = OWNER,
): Promise<void> {
  // Registered first so it matches last: an unmocked API call fails fast
  // instead of reaching a live server on :3000.
  await page.route('**/api/**', (route) => route.abort());
  await page.route('**/api/libraries', (route) => route.fulfill({ json: [LIBRARY] }));
  await page.route('**/api/libraries/lib-1/media', (route) => route.fulfill({ json: MEDIA }));
  // Since #10 the catalog opens for a profile: answer the picker and its progress load.
  await page.route('**/api/auth/status', (route) =>
    route.fulfill({ json: { setupRequired: false, user } satisfies AuthStatus }),
  );
  await page.route('**/api/profiles', (route) => route.fulfill({ json: [PROFILE] }));
  await page.route(`**/api/profiles/${PROFILE.id}/progress`, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(`**/api/profiles/${PROFILE.id}/notifications`, (route) =>
    route.fulfill({ json: notifications }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Me', exact: true }).click();
}

for (const username of ['qa-owner', 'long-owner-name-without-spaces']) {
  test(`the signed-in header fits on narrow screens for ${username}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await openCatalog(page, undefined, { ...OWNER, username });

    const header = page.getByRole('banner');
    const profile = header.getByRole('button', { name: /Me.*switch profile/ });
    const bell = header.getByRole('button', { name: 'Notifications', exact: true });
    const account = header.locator('summary');
    await expect(account).toContainText(username);
    await expect(bell).toHaveAttribute('aria-expanded', 'false');

    for (const viewportWidth of [320, 390]) {
      await page.setViewportSize({ width: viewportWidth, height: 740 });
      for (const control of [profile, bell, account]) {
        await expect(control).toBeVisible();
        const bounds = await control.evaluate((element) => {
          const { left, right, width, height } = element.getBoundingClientRect();
          return { left, right, width, height };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(viewportWidth);
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        await control.click({ trial: true });
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewportWidth);

      await account.click();
      const panel = header.locator('.account-panel');
      const signOut = panel.getByRole('button', { name: 'Sign out', exact: true });
      await expect(signOut).toBeVisible();
      const panelBounds = await panel.evaluate((element) => {
        const { left, right } = element.getBoundingClientRect();
        return { left, right };
      });
      expect(panelBounds.left).toBeGreaterThanOrEqual(0);
      expect(panelBounds.right).toBeLessThanOrEqual(viewportWidth);
      await signOut.click({ trial: true });
      await account.click();
    }
  });
}

const LONG_TITLE = `A newly available title: ${'LongTitle'.repeat(10)}`;
const NOTIFICATIONS: NotificationList = {
  items: [
    {
      id: 1,
      kind: 'movie',
      tmdbId: 1,
      title: LONG_TITLE,
      reason: 'library',
      providerId: null,
      providerName: null,
      createdAt: '2026-11-20T00:00:00Z',
      readAt: '2026-11-20T00:01:00Z',
    },
  ],
  unread: 0,
};

for (const state of ['empty', 'populated'] as const) {
  test(`the ${state} notification panel stays inside mobile and desktop viewports`, async ({
    page,
  }) => {
    const populated = state === 'populated';
    await page.setViewportSize({ width: 320, height: 844 });
    await openCatalog(page, populated ? NOTIFICATIONS : undefined);
    const bell = page.getByRole('button', { name: 'Notifications', exact: true });
    await bell.click();

    const panel = page.locator('#bell-panel');
    const content = populated
      ? panel.getByRole('button', { name: `${LONG_TITLE} is now in your library` })
      : panel.getByText('Nothing new on your list.');
    await expect(content).toBeVisible();

    for (const width of [320, 390, 639, 640, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const bounds = await panel.evaluate((element) => {
        const { left, right } = element.getBoundingClientRect();
        return { left, right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
      });
      expect(bounds.left, `left edge at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(bounds.right, `right edge at ${width}px`).toBeLessThanOrEqual(width);
      expect(bounds.scrollWidth, `panel overflow at ${width}px`).toBeLessThanOrEqual(
        bounds.clientWidth,
      );
      if (width >= 640) {
        const bellRight = await bell.evaluate((element) => element.getBoundingClientRect().right);
        expect(bounds.right, `bell alignment at ${width}px`).toBeCloseTo(bellRight);
      }
      expect(await content.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
        await content.evaluate((element) => element.clientWidth),
      );
    }
  });
}

test('the catalog grid renders from the API and opens a title', async ({ page }) => {
  await openCatalog(page);
  await expect(page.getByRole('heading', { name: 'Top rated' })).toBeVisible();
  await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: 'Films' }).click();
  await page.getByRole('button', { name: 'A–Z' }).click();
  const grid = page.getByRole('region', { name: 'Films — A–Z' });
  await expect(grid.getByRole('button')).toHaveCount(2);

  const poster = grid.getByRole('button', { name: 'Heat' });
  await poster.click();
  const dialog = page.getByRole('dialog', { name: 'Heat' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(poster).toBeFocused();

  await poster.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(poster).toBeFocused();
});

// #169: the browser Back closes the dialog instead of leaving the app.
test('Back closes the detail dialog and a reload on its entry shows the catalog', async ({
  page,
}) => {
  await openCatalog(page);
  const poster = page.getByRole('button', { name: 'Heat' }).first();
  const dialog = page.getByRole('dialog', { name: 'Heat' });

  await poster.click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Top rated' })).toBeVisible();

  // Closed by its button, the dialog goes back over its own entry: no stale entry stays.
  await poster.click();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state as unknown)).toBeNull();

  await poster.click();
  await expect(dialog).toBeVisible();
  await page.reload();
  // The picked profile is remembered (localStorage), so the catalog comes back at once.
  await expect(page.getByRole('heading', { name: 'Top rated' })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state as unknown)).toBeNull();
});

test('the catalog, title dialog, administration and 404 fit at 320 px', async ({ page }) => {
  const viewportWidth = 320;
  const owner = { ...OWNER, username: 'qa-owner' };
  await page.setViewportSize({ width: viewportWidth, height: 740 });
  await openCatalog(page, undefined, owner);
  const expectFits = () =>
    expect(page.locator('html')).toHaveJSProperty('scrollWidth', viewportWidth);

  async function expectRegionFits(region: Locator): Promise<void> {
    const bounds = await region.evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewportWidth);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
  }

  await test.step('catalog', async () => {
    await expect(page.getByRole('heading', { name: 'Top rated' })).toBeVisible();
    await expectFits();
  });

  await test.step('title dialog', async () => {
    await page.getByRole('button', { name: 'Heat', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Heat' });
    await expect(dialog).toBeVisible();
    await expectRegionFits(dialog);
    await expectFits();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  });

  await test.step('administration', async () => {
    const account: Account = {
      ...owner,
      createdAt: '2026-11-20T00:00:00Z',
      lastLoginAt: null,
      activeSessions: 1,
      resetPending: false,
    };
    await page.route('**/api/users', (route) => route.fulfill({ json: [account] }));
    await page.route('**/api/invitations', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/auth/events', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/libraries/folders', (route) =>
      route.fulfill({ json: { root: '/media', folders: [] } satisfies MediaFolderList }),
    );
    const summary = page.getByRole('banner').locator('summary');
    await summary.click();
    await page.getByRole('button', { name: 'Administration', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Accounts' }).getByText(owner.username),
    ).toBeVisible();
    await expectRegionFits(page.getByRole('region', { name: 'Administration' }));
    await expectFits();
  });

  await test.step('404 page', async () => {
    await page.goto('/404.html');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expectRegionFits(page.getByRole('main'));
    await expectFits();
  });
});
