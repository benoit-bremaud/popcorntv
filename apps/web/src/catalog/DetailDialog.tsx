import { useEffect, useRef, useState } from 'react';
import { audioTracks, decidePlayback, matchAudioTrack } from '@popcorntv/shared';
import type { AudioTrack, CanPlay, Library, Media, WatchProgress } from '@popcorntv/shared';
import { artworkUrl, loadProgress, setWatched } from '../api.js';
import { browserCanPlay } from '../playback/can-play.js';
import { PlayerDialog } from '../playback/PlayerDialog.js';
import type { PlaybackApi } from '../playback/PlayerDialog.js';
import { formatPosition, resumeAt } from '../playback/resume.js';
import { isWatched, nextEpisode } from './catalog.js';
import type { Season } from './catalog.js';
import { useHistoryLayer } from '../history-layer.js';

type Props = {
  readonly item: Media;
  readonly seasons: readonly Season[];
  /** Every file holding this title, in library order (spec duplicate-titles R4); `[item]` alone otherwise. */
  readonly copies?: readonly Media[];
  /** The copy shown first; defaults to `item` (R5). */
  readonly initialCopyId?: string;
  /** Names the copies by their library (R4). */
  readonly libraries?: readonly Library[];
  /** The active profile: progress is read and saved for it (UC8). */
  readonly profileId: string;
  /** Called with the player's last save, so the caller reloads once it landed (#140). */
  readonly onClose: (lastSave: Promise<void>) => void;
  /** The browser's decoder check; injected by tests (jsdom decodes nothing). */
  readonly canPlay?: CanPlay;
  /** Playback server calls; injected by tests. */
  readonly api?: PlaybackApi;
  /** `GET /profiles/:profileId/progress`; injected by tests. */
  readonly progress?: typeof loadProgress;
  /** `PUT | DELETE …/watched`; injected by tests. */
  readonly markWatched?: typeof setWatched;
};

/** What the player plays and where it starts. */
type Playing = { readonly media: Media; readonly startSec: number };

function facts(item: Media): string[] {
  const runtime = item.metadata?.runtimeMin ?? null;
  const rating = item.metadata?.voteAverage ?? null;
  return [
    item.year === null ? null : String(item.year),
    runtime === null ? null : `${runtime} min`,
    rating === null ? null : `★ ${rating.toFixed(1)}`,
  ].filter((fact): fact is string => fact !== null);
}

/** An episode's accessible name: untitled episodes all carry the series title. */
function episodeName(episode: Media): string {
  return episode.episode === null ? episode.title : `${episode.title}, episode ${episode.episode}`;
}

/** A copy's label: its library's name, else its path (spec duplicate-titles R4). */
function copyLabel(copy: Media, libraries: readonly Library[]): string {
  return (
    libraries.find((library) => library.id === copy.libraryId)?.name ?? copy.relativePath ?? copy.id
  );
}

/** UC4: a modal `<dialog>` over the catalog; Escape, the close button or Back close it. */
export function DetailDialog({
  item: shownItem,
  seasons,
  copies = [shownItem],
  initialCopyId = shownItem.id,
  libraries = [],
  profileId,
  onClose,
  canPlay = browserCanPlay,
  api,
  progress = loadProgress,
  markWatched = setWatched,
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  // Spec duplicate-titles: Play, Resume and the watched mark act on the chosen copy (spec duplicate-titles R5).
  const [copyId, setCopyId] = useState(initialCopyId);
  const item = copies.find((copy) => copy.id === copyId) ?? shownItem;
  // Back closes the layer; a close by button or Escape leaves its entry (ADR-0024).
  useHistoryLayer(ref);
  const [playing, setPlaying] = useState<Playing | null>(null);
  /** Null until the first load: Play waits for it, so a resume point is never skipped. */
  const [saved, setSaved] = useState<ReadonlyMap<string, WatchProgress> | null>(null);
  /** Only the latest request may set `saved` (a slow first load must not win). */
  const request = useRef(0);

  async function refreshProgress(): Promise<void> {
    const id = ++request.current;
    const rows = await progress(profileId);
    if (id === request.current) setSaved(new Map(rows.map((row) => [row.mediaId, row])));
  }

  useEffect(() => {
    void refreshProgress();
    // Once per opened title; the player's close refreshes it again.
  }, []);

  const resume = (media: Media): number => resumeAt(saved?.get(media.id));
  const episodes = seasons.flatMap((season) => season.episodes);
  // UC25: the tracks of the title, or of a series' first episode. Until the viewer picks one,
  // every file plays its first track (direct play kept, ADR-0019); a pick is matched by
  // language on each played file (Next episode included, spec audio-track R4).
  const tracks = audioTracks((episodes[0] ?? item).streams);
  const [chosen, setChosen] = useState<AudioTrack | null>(null);
  const playingAudio =
    playing === null || chosen === null ? 0 : matchAudioTrack(playing.media.streams, chosen);
  const watched = saved !== null && isWatched(item, episodes, saved);

  /** UC23: marks the title (a series: all its episodes) watched or not, then reloads. */
  async function toggleWatched(): Promise<void> {
    await markWatched(profileId, item.id, !watched);
    await refreshProgress();
  }
  // The Play button that opened the player gets the focus back when it closes (spec step 6).
  const trigger = useRef<HTMLButtonElement | null>(null);

  function play(media: Media, startSec: number, button: HTMLButtonElement): void {
    trigger.current = button;
    setPlaying({ media, startSec });
  }

  /** The player's latest save, handed to `onClose` (spec continue-watching R7). */
  const lastSave = useRef<Promise<void>>(Promise.resolve());

  /** Reloads the offer once the player's last save has landed (spec step 7). */
  async function stop(landed: Promise<void>): Promise<void> {
    lastSave.current = landed;
    setPlaying(null);
    trigger.current?.focus();
    await landed;
    await refreshProgress();
  }

  // Every file with a video stream plays: directly, or through HLS (spec hls-transcode R1).
  const playable = (media: Media): boolean =>
    media.kind !== 'series' && media.streams.some((stream) => stream.type === 'video');

  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  const metadata = item.metadata;
  const backdrop = metadata?.backdropPath ?? null;
  const titleId = `detail-${shownItem.id}`;

  return (
    <dialog
      ref={ref}
      className="detail"
      aria-labelledby={titleId}
      // Every close path (button, Escape, Back) ends in the native `close` event, fired once the
      // modal is no longer inert, so the caller can move the focus back. React propagates
      // `close` up its tree, so the nested player's own close must not end the detail too.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose(lastSave.current);
      }}
    >
      <div className="detail__panel">
        {backdrop !== null && (
          <img className="detail__backdrop" src={artworkUrl(backdrop)} alt="" />
        )}
        <button
          type="button"
          className="detail__close"
          aria-label="Close"
          onClick={() => ref.current?.close()}
        >
          ✕
        </button>
        <div className="detail__body">
          <h2 className="detail__title" id={titleId}>
            {item.title}
          </h2>
          <p className="detail__facts">{facts(item).join(' · ')}</p>
          {copies.length > 1 && (
            <>
              <p className="detail__libraries">
                <span className="muted">In: </span>
                {copies.map((copy) => copyLabel(copy, libraries)).join(' · ')}
              </p>
              <label className="detail__audio">
                <span className="muted">Copy </span>
                <select
                  className="chip"
                  value={item.id}
                  onChange={(event) => setCopyId(event.currentTarget.value)}
                >
                  {copies.map((copy) => (
                    <option key={copy.id} value={copy.id}>
                      {copyLabel(copy, libraries)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {saved !== null && (playable(item) || episodes.length > 0) && (
            <div className="detail__actions">
              {playable(item) && resume(item) > 0 && (
                <>
                  <button
                    type="button"
                    className="button"
                    onClick={(event) => play(item, resume(item), event.currentTarget)}
                  >
                    ▶ Resume from {formatPosition(resume(item))}
                  </button>
                  <button
                    type="button"
                    className="chip"
                    onClick={(event) => play(item, 0, event.currentTarget)}
                  >
                    Start over
                  </button>
                </>
              )}
              {playable(item) && resume(item) === 0 && (
                <button
                  type="button"
                  className="button"
                  onClick={(event) => play(item, 0, event.currentTarget)}
                >
                  ▶ Play
                </button>
              )}
              <button
                type="button"
                className="chip"
                aria-pressed={watched}
                onClick={() => void toggleWatched()}
              >
                {watched ? '✓ Watched' : 'Mark as watched'}
              </button>
            </div>
          )}
          {tracks.length > 1 && (
            <label className="detail__audio">
              <span className="muted">Audio </span>
              <select
                className="chip"
                value={chosen?.index ?? 0}
                onChange={(event) => setChosen(tracks[Number(event.currentTarget.value)] ?? null)}
              >
                {tracks.map((track) => (
                  <option key={track.index} value={track.index}>
                    {track.language ?? `Track ${track.index + 1}`} ({track.codec})
                  </option>
                ))}
              </select>
            </label>
          )}
          {metadata !== null && metadata.genres.length > 0 && (
            <ul className="detail__genres" aria-label="Genres">
              {metadata.genres.map((genre) => (
                <li key={genre.id}>{genre.name}</li>
              ))}
            </ul>
          )}
          <p className="detail__overview">{metadata?.overview ?? 'No synopsis yet.'}</p>
          {metadata !== null && metadata.cast.length > 0 && (
            <p className="detail__cast">
              <span className="muted">Cast: </span>
              {metadata.cast.map((member) => member.name).join(', ')}
            </p>
          )}
          {seasons.map((season) => (
            <section key={season.season ?? 'none'} className="detail__season">
              <h3>{season.season === null ? 'Episodes' : `Season ${season.season}`}</h3>
              <ol>
                {season.episodes.map((episode) => (
                  <li key={episode.id}>
                    <span className="muted">{episode.episode ?? '–'}</span> {episode.title}
                    {saved?.get(episode.id)?.finished === true && (
                      <span className="muted"> · watched</span>
                    )}
                    {playable(episode) && saved !== null && (
                      <button
                        type="button"
                        className="chip chip--small detail__episode-play"
                        aria-label={
                          resume(episode) > 0
                            ? `Resume ${episodeName(episode)} from ${formatPosition(resume(episode))}`
                            : `Play ${episodeName(episode)}`
                        }
                        onClick={(event) => play(episode, resume(episode), event.currentTarget)}
                      >
                        ▶
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
      {playing !== null && (
        <PlayerDialog
          key={playing.media.id}
          item={playing.media}
          profileId={profileId}
          directPlay={
            playingAudio === 0 && decidePlayback(playing.media, canPlay).mode === 'direct'
          }
          audioIndex={playingAudio}
          startSec={playing.startSec}
          next={nextEpisode(seasons, playing.media)}
          onNext={(episode) => setPlaying({ media: episode, startSec: resume(episode) })}
          onClose={(lastSave) => void stop(lastSave)}
          api={api}
        />
      )}
    </dialog>
  );
}
