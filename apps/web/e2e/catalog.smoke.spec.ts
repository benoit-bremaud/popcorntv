import { expect, test, type Page } from '@playwright/test';
import type { AuthStatus, Library, Media, Profile, User } from '@popcorntv/shared';

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

async function openCatalog(page: Page): Promise<void> {
  // Registered first so it matches last: an unmocked API call fails fast
  // instead of reaching a live server on :3000.
  await page.route('**/api/**', (route) => route.abort());
  await page.route('**/api/libraries', (route) => route.fulfill({ json: [LIBRARY] }));
  await page.route('**/api/libraries/lib-1/media', (route) => route.fulfill({ json: MEDIA }));
  // Since #10 the catalog opens for a profile: answer the picker and its progress load.
  await page.route('**/api/auth/status', (route) =>
    route.fulfill({ json: { setupRequired: false, user: OWNER } satisfies AuthStatus }),
  );
  await page.route('**/api/profiles', (route) => route.fulfill({ json: [PROFILE] }));
  await page.route(`**/api/profiles/${PROFILE.id}/progress`, (route) =>
    route.fulfill({ json: [] }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Me', exact: true }).click();
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
