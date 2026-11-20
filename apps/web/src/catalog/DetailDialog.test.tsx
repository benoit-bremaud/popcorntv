import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  CanPlay,
  Library,
  Media,
  PlaybackSessionBody,
  StreamInfo,
  WatchProgress,
} from '@popcorntv/shared';
import type { PlaybackApi } from '../playback/PlayerDialog.js';
import { media, metadata } from '../test-fixtures.js';
import { DetailDialog } from './DetailDialog.js';
import type { Season } from './catalog.js';

const H264_AAC: StreamInfo[] = [
  { type: 'video', codec: 'h264', width: 1920, height: 1080, language: null },
  { type: 'audio', codec: 'aac', width: null, height: null, language: 'eng' },
];

const heat = media({ id: 'heat', title: 'Heat', relativePath: 'Heat.mp4', streams: H264_AAC });
const always: CanPlay = () => 'probably';

/** A server double: confirms direct play when asked, answers busy for HLS (no hls.js here). */
function fakeApi(): PlaybackApi & { start: ReturnType<typeof vi.fn> } {
  return {
    start: vi.fn(async ({ mediaId, directPlay, startSec = 0 }: PlaybackSessionBody) =>
      directPlay
        ? {
            mode: 'direct' as const,
            url: `/api/media/${mediaId}/file`,
            mime: 'video/mp4',
            startSec,
            offsetSec: 0,
          }
        : ('busy' as const),
    ),
    heartbeat: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
  };
}

/** No personal link: keeps the UC30 block off the network (boundary mock). */
const noLink = { load: async () => ({ url: null, editable: false }), save: async () => true };

function renderDetail(
  item: Media,
  canPlay: CanPlay = always,
  onClose = vi.fn(),
  saved: readonly WatchProgress[] = [],
  seasons: readonly Season[] = [],
) {
  const api = fakeApi();
  const progress = vi.fn(async () => [...saved]);
  return {
    user: userEvent.setup(),
    onClose,
    api,
    progress,
    ...render(
      <DetailDialog
        titleLink={noLink}
        profileId="kid"
        item={item}
        seasons={seasons}
        onClose={onClose}
        canPlay={canPlay}
        api={api}
        progress={progress}
      />,
    ),
  };
}

describe('DetailDialog playback', () => {
  it("reads the active profile's progress", async () => {
    const { progress } = renderDetail(heat);

    await screen.findByRole('button', { name: '▶ Play' });

    expect(progress).toHaveBeenCalledWith('kid');
  });

  it('plays a direct-playable film in a native video and returns focus to Play', async () => {
    const { user, onClose } = renderDetail(heat);

    const play = await screen.findByRole('button', { name: '▶ Play' });
    await user.click(play);

    const player = screen.getByRole('dialog', { name: 'Playing Heat' });
    await waitFor(() => expect(player.querySelector('video')).not.toBeNull());
    const video = player.querySelector('video');
    expect(video?.getAttribute('src')).toBe('/api/media/heat/file');
    expect(video?.controls).toBe(true);

    await user.click(within(player).getByRole('button', { name: 'Close player' }));
    expect(screen.queryByRole('dialog', { name: 'Playing Heat' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Heat' })).toBeInTheDocument();
    expect(play).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows an error in the player when the file cannot be decoded', async () => {
    const { user } = renderDetail(heat);
    await user.click(await screen.findByRole('button', { name: '▶ Play' }));

    const player = screen.getByRole('dialog', { name: 'Playing Heat' });
    const video = await waitFor(() => {
      const element = player.querySelector('video');
      if (element === null) throw new Error('no video yet');
      return element;
    });
    fireEvent.error(video);

    expect(within(player).getByRole('alert')).toHaveTextContent('This file could not be played.');
  });

  it('plays a file the browser cannot decode by asking the server for HLS', async () => {
    const { user, api } = renderDetail(heat, () => '');

    await user.click(await screen.findByRole('button', { name: '▶ Play' }));

    expect(api.start).toHaveBeenCalledWith({
      mediaId: 'heat',
      directPlay: false,
      startSec: 0,
      audioIndex: 0,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another title is being transcoded. Try again later.',
    );
  });

  it('offers Play for an MKV, left to HLS (#8)', async () => {
    const { user, api } = renderDetail(media({ id: 'mkv', title: 'Mkv', streams: H264_AAC }));

    await user.click(await screen.findByRole('button', { name: '▶ Play' }));

    expect(api.start).toHaveBeenCalledWith({
      mediaId: 'mkv',
      directPlay: false,
      startSec: 0,
      audioIndex: 0,
    });
  });

  it('offers no Play button for a file without video', () => {
    renderDetail(media({ id: 'cd', title: 'Score', streams: [] }));

    expect(screen.queryByRole('button', { name: '▶ Play' })).not.toBeInTheDocument();
  });

  it('plays an episode from its season list, not the series row', async () => {
    const dark = media({ id: 'dark', title: 'Dark', kind: 'series', relativePath: null });
    const pilot = media({
      id: 'pilot',
      title: 'Secrets',
      kind: 'episode',
      relativePath: 'Dark/S01E01.mp4',
      streams: H264_AAC,
      seriesId: 'dark',
      season: 1,
      episode: 1,
    });
    const user = userEvent.setup();
    render(
      <DetailDialog
        titleLink={noLink}
        profileId="kid"
        item={dark}
        seasons={[{ season: 1, episodes: [pilot] }]}
        onClose={vi.fn()}
        canPlay={always}
        api={fakeApi()}
      />,
    );

    expect(screen.queryByRole('button', { name: '▶ Play' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Play Secrets, episode 1' }));

    expect(screen.getByRole('dialog', { name: 'Playing Secrets' })).toBeInTheDocument();
  });

  it('keeps the detail open when the player closes (Escape) on its own', async () => {
    const { user, onClose } = renderDetail(heat);
    await user.click(await screen.findByRole('button', { name: '▶ Play' }));

    (screen.getByRole('dialog', { name: 'Playing Heat' }) as HTMLDialogElement).close();

    expect(screen.queryByRole('dialog', { name: 'Playing Heat' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes the detail itself', async () => {
    const { user, onClose } = renderDetail(heat);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should hand a settled save to onClose when nothing was played (#140)', async () => {
    const { user, onClose } = renderDetail(heat);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await expect(onClose.mock.calls[0]?.[0]).resolves.toBeUndefined();
  });

  it("should hand the player's last save to onClose (#140)", async () => {
    const { user, onClose, api } = renderDetail(heat);
    let land: () => void = () => undefined;
    vi.mocked(api.save).mockImplementation(
      () =>
        new Promise<void>((done) => {
          land = done;
        }),
    );
    await user.click(await screen.findByRole('button', { name: '▶ Play' }));
    const player = screen.getByRole('dialog', { name: 'Playing Heat' });
    await waitFor(() => expect(player.querySelector('video')).not.toBeNull());
    fireEvent.loadedMetadata(player.querySelector('video') as HTMLVideoElement);
    await user.click(within(player).getByRole('button', { name: 'Close player' }));

    await user.click(screen.getByRole('button', { name: 'Close' }));

    const handed = onClose.mock.calls[0]?.[0] as Promise<void>;
    let settled = false;
    void handed.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    land();
    await handed;
    expect(settled).toBe(true);
  });
});

function saved(mediaId: string, positionSec: number, finished = false): WatchProgress {
  return { mediaId, positionSec, durationSec: 6000, finished, updatedAt: '' };
}

describe('DetailDialog resume', () => {
  it('offers to resume at the saved position', async () => {
    const { user, api } = renderDetail(heat, always, vi.fn(), [saved('heat', 754)]);

    await user.click(await screen.findByRole('button', { name: '▶ Resume from 12:34' }));

    expect(api.start).toHaveBeenCalledWith({
      mediaId: 'heat',
      directPlay: true,
      startSec: 754,
      audioIndex: 0,
    });
  });

  it('starts over from 0 on request', async () => {
    const { user, api } = renderDetail(heat, always, vi.fn(), [saved('heat', 754)]);

    await user.click(await screen.findByRole('button', { name: 'Start over' }));

    expect(api.start).toHaveBeenCalledWith({
      mediaId: 'heat',
      directPlay: true,
      startSec: 0,
      audioIndex: 0,
    });
  });

  it('offers a plain Play for a finished title', async () => {
    const { user, api } = renderDetail(heat, always, vi.fn(), [saved('heat', 5900, true)]);

    await user.click(await screen.findByRole('button', { name: '▶ Play' }));

    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull();
    expect(api.start).toHaveBeenCalledWith({
      mediaId: 'heat',
      directPlay: true,
      startSec: 0,
      audioIndex: 0,
    });
  });

  it('resumes an episode at its own position', async () => {
    const series = media({ id: 'show', title: 'Show', kind: 'series' });
    const pilot = media({
      id: 'e1',
      title: 'Pilot',
      kind: 'episode',
      season: 1,
      episode: 1,
      relativePath: 'Show/S01E01.mp4',
      streams: H264_AAC,
    });
    const { user, api } = renderDetail(
      series,
      always,
      vi.fn(),
      [saved('e1', 65)],
      [{ season: 1, episodes: [pilot] }],
    );

    await user.click(
      await screen.findByRole('button', { name: 'Resume Pilot, episode 1 from 1:05' }),
    );

    expect(api.start).toHaveBeenCalledWith({
      mediaId: 'e1',
      directPlay: true,
      startSec: 65,
      audioIndex: 0,
    });
  });
});

describe('DetailDialog progress refresh and next episode', () => {
  const series = media({ id: 'show', title: 'Show', kind: 'series' });
  const episode = (id: string, title: string, number: number): Media =>
    media({
      id,
      title,
      kind: 'episode',
      season: 1,
      episode: number,
      durationSec: 100,
      relativePath: `Show/S01E0${number}.mp4`,
      streams: H264_AAC,
    });
  const pilot = episode('e1', 'Pilot', 1);
  const second = episode('e2', 'Second', 2);

  it('reloads the resume offer once the player closed and saved', async () => {
    const api = fakeApi();
    const progress = vi
      .fn<() => Promise<WatchProgress[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([saved('heat', 754)]);
    const user = userEvent.setup();
    render(
      <DetailDialog
        titleLink={noLink}
        profileId="kid"
        item={heat}
        seasons={[]}
        onClose={vi.fn()}
        canPlay={always}
        api={api}
        progress={progress}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '▶ Play' }));
    await user.click(await screen.findByRole('button', { name: 'Close player' }));

    expect(await screen.findByRole('button', { name: '▶ Resume from 12:34' })).toBeInTheDocument();
  });

  it('plays the next episode from its own resume point', async () => {
    const { user, api } = renderDetail(
      series,
      always,
      vi.fn(),
      [saved('e2', 40)],
      [{ season: 1, episodes: [pilot, second] }],
    );
    await user.click(await screen.findByRole('button', { name: 'Play Pilot, episode 1' }));
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    const element = document.querySelector('video') as HTMLVideoElement;
    fireEvent.loadedMetadata(element);
    element.currentTime = 95;

    fireEvent.timeUpdate(element);
    await user.click(await screen.findByRole('button', { name: 'Next episode: Second ▶' }));

    await waitFor(() =>
      expect(api.start).toHaveBeenLastCalledWith({
        mediaId: 'e2',
        directPlay: true,
        startSec: 40,
        audioIndex: 0,
      }),
    );
    expect(api.save).toHaveBeenCalledWith('kid', 'e1', 95);
  });
  it('shows a series watched when all its episodes are finished, and labels each one', async () => {
    renderDetail(
      series,
      always,
      vi.fn(),
      [saved('e1', 5900, true), saved('e2', 5900, true)],
      [{ season: 1, episodes: [pilot, second].map((e) => ({ ...e, seriesId: 'show' })) }],
    );

    expect(await screen.findByRole('button', { name: '✓ Watched' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Pilot').closest('li')).toHaveTextContent('watched');
  });

  it('offers no watched toggle for a series without episodes', async () => {
    const { progress } = renderDetail(series);

    await waitFor(() => expect(progress).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: 'Mark as watched' })).toBeNull();
  });
});

describe('DetailDialog watched mark (spec watched-marks)', () => {
  const finished: WatchProgress = {
    mediaId: 'heat',
    positionSec: 0,
    durationSec: null,
    finished: true,
    updatedAt: '2026-11-07T00:00:00.000Z',
  };

  it('should mark a film watched, then show it pressed after the reload', async () => {
    const markWatched = vi.fn(async () => true);
    const progress = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([finished]);
    const user = userEvent.setup();
    render(
      <DetailDialog
        titleLink={noLink}
        profileId="kid"
        item={heat}
        seasons={[]}
        onClose={vi.fn()}
        canPlay={always}
        api={fakeApi()}
        progress={progress}
        markWatched={markWatched}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Mark as watched' }));

    expect(markWatched).toHaveBeenCalledWith('kid', 'heat', true);
    expect(await screen.findByRole('button', { name: '✓ Watched' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('should unmark a watched film', async () => {
    const markWatched = vi.fn(async () => true);
    const user = userEvent.setup();
    render(
      <DetailDialog
        titleLink={noLink}
        profileId="kid"
        item={heat}
        seasons={[]}
        onClose={vi.fn()}
        canPlay={always}
        api={fakeApi()}
        progress={async () => [finished]}
        markWatched={markWatched}
      />,
    );

    await user.click(await screen.findByRole('button', { name: '✓ Watched' }));

    expect(markWatched).toHaveBeenCalledWith('kid', 'heat', false);
  });

  it('should keep the old state when the server refuses the mark', async () => {
    const markWatched = vi.fn(async () => false);
    const user = userEvent.setup();
    render(
      <DetailDialog
        titleLink={noLink}
        profileId="kid"
        item={heat}
        seasons={[]}
        onClose={vi.fn()}
        canPlay={always}
        api={fakeApi()}
        progress={async () => []}
        markWatched={markWatched}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Mark as watched' }));

    expect(await screen.findByRole('button', { name: 'Mark as watched' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('DetailDialog action row (#172)', () => {
  function actionsOf(button: HTMLElement): string[] {
    const row = button.closest('.detail__actions');
    expect(row).not.toBeNull();
    return Array.from(row?.querySelectorAll('button') ?? [], (b) => b.textContent ?? '');
  }

  it('puts Play and the watched toggle in one row', async () => {
    renderDetail(heat);

    const play = await screen.findByRole('button', { name: '▶ Play' });

    expect(actionsOf(play)).toEqual(['▶ Play', 'Mark as watched']);
  });

  it('puts Resume, Start over and the watched toggle in one row', async () => {
    renderDetail(heat, always, vi.fn(), [saved('heat', 754)]);

    const resume = await screen.findByRole('button', { name: '▶ Resume from 12:34' });

    expect(actionsOf(resume)).toEqual(['▶ Resume from 12:34', 'Start over', 'Mark as watched']);
  });

  it('keeps the row with only the watched toggle for a series', async () => {
    const series = media({ id: 'show', title: 'Show', kind: 'series' });
    const pilot = media({
      id: 'e1',
      title: 'Pilot',
      kind: 'episode',
      seriesId: 'show',
      season: 1,
      episode: 1,
      streams: H264_AAC,
    });
    renderDetail(series, always, vi.fn(), [], [{ season: 1, episodes: [pilot] }]);

    const toggle = await screen.findByRole('button', { name: 'Mark as watched' });

    expect(actionsOf(toggle)).toEqual(['Mark as watched']);
  });

  it('labels the cast "Cast:"', async () => {
    const cast = [{ name: 'Al Pacino', character: 'Hanna', profilePath: null }];
    renderDetail({ ...heat, metadata: metadata({ cast }) });

    expect(await screen.findByText('Cast:')).toBeInTheDocument();
    expect(screen.getByText('Cast:').parentElement).toHaveTextContent('Cast: Al Pacino');
  });

  it('shows no cast line when the cast is empty', async () => {
    renderDetail({ ...heat, metadata: metadata({ cast: [] }) });

    await screen.findByRole('button', { name: '▶ Play' });

    expect(screen.queryByText('Cast:')).toBeNull();
  });
});

describe('DetailDialog audio track (spec audio-track)', () => {
  it('should play the chosen track through HLS', async () => {
    const dual = media({
      id: 'dual',
      title: 'Dual',
      relativePath: 'Dual.mp4',
      streams: [
        ...H264_AAC,
        { type: 'audio', codec: 'ac3', width: null, height: null, language: 'fre' },
      ],
    });
    const { user, api } = renderDetail(dual);

    await user.selectOptions(await screen.findByRole('combobox'), 'Français (ac3)');
    await user.click(screen.getByRole('button', { name: '▶ Play' }));

    expect(api.start).toHaveBeenCalledWith({
      mediaId: 'dual',
      directPlay: false,
      startSec: 0,
      audioIndex: 1,
    });
  });

  it('should offer no choice for a single track', async () => {
    renderDetail(heat);

    await screen.findByRole('button', { name: '▶ Play' });
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  describe('in a series whose episodes order their tracks differently', () => {
    const track = (language: string) =>
      ({ type: 'audio', codec: 'aac', width: null, height: null, language }) as const;
    const episode = (id: string, number: number, languages: readonly string[]): Media =>
      media({
        id,
        title: `Ep ${number}`,
        kind: 'episode',
        season: 1,
        episode: number,
        relativePath: `Show/S01E0${number}.mp4`,
        streams: [H264_AAC[0] as Media['streams'][number], ...languages.map(track)],
      });
    const show = media({ id: 'show', title: 'Show', kind: 'series' });

    it('should keep direct play on the first track while nothing was picked', async () => {
      const first = episode('e1', 1, ['eng']);
      const fifth = episode('e5', 5, ['fre', 'eng']);
      const { user, api } = renderDetail(
        show,
        always,
        vi.fn(),
        [],
        [{ season: 1, episodes: [first, fifth] }],
      );

      await user.click(await screen.findByRole('button', { name: 'Play Ep 5, episode 5' }));

      expect(screen.queryByRole('combobox')).toBeNull();
      expect(api.start).toHaveBeenCalledWith({
        mediaId: 'e5',
        directPlay: true,
        startSec: 0,
        audioIndex: 0,
      });
    });

    it('should match the picked language on another episode', async () => {
      const first = episode('e1', 1, ['eng', 'fre']);
      const second = episode('e2', 2, ['fre', 'eng']);
      const { user, api } = renderDetail(
        show,
        always,
        vi.fn(),
        [],
        [{ season: 1, episodes: [first, second] }],
      );

      await user.selectOptions(await screen.findByRole('combobox'), 'English (aac)');
      await user.click(screen.getByRole('button', { name: 'Play Ep 2, episode 2' }));

      expect(api.start).toHaveBeenCalledWith({
        mediaId: 'e2',
        directPlay: false,
        startSec: 0,
        audioIndex: 1,
      });
    });
  });
});

describe('DetailDialog copies', () => {
  const animation = { ...heat, id: 'heat-2', libraryId: 'lib-2', relativePath: 'Heat (1995).mp4' };
  const libraries: Library[] = [
    { id: 'lib-1', name: 'Films', rootPath: '/media/films', kind: 'films' },
    { id: 'lib-2', name: 'Animation', rootPath: '/media/animation', kind: 'films' },
  ];

  function renderCopies(initialCopyId?: string, known = libraries, copies = [heat, animation]) {
    const api = fakeApi();
    const progress = vi.fn(async (): Promise<WatchProgress[]> => [
      { mediaId: 'heat-2', positionSec: 600, durationSec: 6000, finished: false, updatedAt: 'x' },
    ]);
    render(
      <DetailDialog
        titleLink={noLink}
        profileId="kid"
        item={heat}
        seasons={[]}
        copies={copies}
        initialCopyId={initialCopyId}
        libraries={known}
        onClose={vi.fn()}
        canPlay={always}
        api={api}
        progress={progress}
      />,
    );
    return { user: userEvent.setup(), api };
  }

  it('should list the libraries and play the chosen copy from its own resume point', async () => {
    const { user, api } = renderCopies();
    const dialog = screen.getByRole('dialog', { name: 'Heat' });
    expect(within(dialog).getByText('Films · Animation')).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Copy' }), 'Animation');
    await user.click(await within(dialog).findByRole('button', { name: /Resume from 10:00/ }));

    await waitFor(() =>
      expect(api.start).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: 'heat-2', startSec: 600 }),
      ),
    );
  });

  it('should start on the copy it was opened for', async () => {
    renderCopies('heat-2');

    expect(screen.getByRole('combobox', { name: 'Copy' })).toHaveValue('heat-2');
    expect(await screen.findByRole('button', { name: /Resume from/ })).toBeInTheDocument();
  });

  it('should name a copy by its path when its library is unknown', () => {
    renderCopies(undefined, []);

    expect(screen.getByText('Heat.mp4 · Heat (1995).mp4')).toBeInTheDocument();
  });

  it('should go back to the first audio track when another copy is chosen', async () => {
    const dual: StreamInfo[] = [
      ...H264_AAC,
      { type: 'audio', codec: 'aac', width: null, height: null, language: 'fra' },
    ];
    renderCopies(undefined, libraries, [
      { ...heat, streams: dual },
      { ...animation, streams: dual },
    ]);
    const user = userEvent.setup();
    const audio = screen.getByRole('combobox', { name: 'Audio' });
    await user.selectOptions(audio, '1');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Copy' }), 'Animation');

    expect(screen.getByRole('combobox', { name: 'Audio' })).toHaveValue('0');
  });

  it('should add the path to copies that share a library', () => {
    renderCopies(undefined, libraries, [heat, { ...animation, libraryId: 'lib-1' }]);

    expect(screen.getByText('Films — Heat.mp4 · Films — Heat (1995).mp4')).toBeInTheDocument();
  });

  it('should show no copy picker for a single file', async () => {
    renderDetail(heat);
    await screen.findByRole('button', { name: /Play/ });

    expect(screen.queryByRole('combobox', { name: 'Copy' })).not.toBeInTheDocument();
  });
});

describe('DetailDialog where to watch (UC27)', () => {
  const offers = { link: null, offers: [] };

  it.each([
    ['film', 'movie'],
    ['series', 'tv'],
  ] as const)('asks the offers of a matched %s as TMDB %s', async (kind, tmdbKind) => {
    const watchProviders = vi.fn(async () => offers);
    const titleLink = { ...noLink, load: vi.fn(noLink.load) };
    const item = media({ id: 'm', title: 'Dune', kind, metadata: metadata({ tmdbId: 7 }) });

    render(
      <DetailDialog
        titleLink={titleLink}
        profileId="kid"
        item={item}
        seasons={[]}
        onClose={vi.fn()}
        canPlay={always}
        api={fakeApi()}
        progress={async () => []}
        watchProviders={watchProviders}
      />,
    );

    expect(await screen.findByText('No legal offer in France for now.')).toBeInTheDocument();
    expect(watchProviders).toHaveBeenCalledWith(tmdbKind, 7);
    expect(titleLink.load).toHaveBeenCalledWith(tmdbKind, 7);
  });

  it.each([
    [
      'an episode',
      media({ id: 'e', title: 'Pilot', kind: 'episode', metadata: metadata({ tmdbId: 7 }) }),
    ],
    ['an unmatched film', media({ id: 'f', title: 'Home', kind: 'film', metadata: metadata() })],
  ])('shows no offer block nor title link for %s', async (_label, item) => {
    const watchProviders = vi.fn(async () => offers);
    const titleLink = { ...noLink, load: vi.fn(noLink.load) };

    render(
      <DetailDialog
        titleLink={titleLink}
        profileId="kid"
        item={item}
        seasons={[]}
        onClose={vi.fn()}
        canPlay={always}
        api={fakeApi()}
        progress={async () => []}
        watchProviders={watchProviders}
      />,
    );

    await screen.findByRole('dialog');
    expect(screen.queryByText('Where to watch (France)')).toBeNull();
    expect(watchProviders).not.toHaveBeenCalled();
    expect(titleLink.load).not.toHaveBeenCalled();
  });
});
