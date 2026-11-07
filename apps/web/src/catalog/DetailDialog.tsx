import { useEffect, useRef, useState } from 'react';
import { audioTracks, decidePlayback, matchAudioTrack } from '@popcorntv/shared';
import type { CanPlay, Media, WatchProgress } from '@popcorntv/shared';
import { artworkUrl, loadProgress, setWatched } from '../api.js';
import { browserCanPlay } from '../playback/can-play.js';
import { PlayerDialog } from '../playback/PlayerDialog.js';
import type { PlaybackApi } from '../playback/PlayerDialog.js';
import { formatPosition, resumeAt } from '../playback/resume.js';
import { isWatched, nextEpisode } from './catalog.js';
import type { Season } from './catalog.js';

type Props = {
  readonly item: Media;
  readonly seasons: readonly Season[];
  /** The active profile: progress is read and saved for it (UC8). */
  readonly profileId: string;
  readonly onClose: () => void;
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

/** UC4: a modal `<dialog>` over the catalog; Escape or the close button close it. */
export function DetailDialog({
  item,
  seasons,
  profileId,
  onClose,
  canPlay = browserCanPlay,
  api,
  progress = loadProgress,
  markWatched = setWatched,
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
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
  // UC25: the tracks of the title, or of a series' first episode; the choice is matched by
  // language on each played file (Next episode included).
  const tracks = audioTracks((episodes[0] ?? item).streams);
  const [audio, setAudio] = useState(0);
  const chosen = tracks[audio];
  const playingAudio =
    playing === null || chosen === undefined ? 0 : matchAudioTrack(playing.media.streams, chosen);
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

  /** Reloads the offer once the player's last save has landed (spec step 7). */
  async function stop(lastSave: Promise<void>): Promise<void> {
    setPlaying(null);
    trigger.current?.focus();
    await lastSave;
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
  const titleId = `detail-${item.id}`;

  return (
    <dialog
      ref={ref}
      className="detail"
      aria-labelledby={titleId}
      // Every close path (button, Escape) ends in the native `close` event, fired once the
      // modal is no longer inert, so the caller can move the focus back. React propagates
      // `close` up its tree, so the nested player's own close must not end the detail too.
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
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
          {playable(item) && saved !== null && (
            <div className="detail__actions">
              {resume(item) > 0 ? (
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
              ) : (
                <button
                  type="button"
                  className="button"
                  onClick={(event) => play(item, 0, event.currentTarget)}
                >
                  ▶ Play
                </button>
              )}
            </div>
          )}
          {saved !== null && (playable(item) || episodes.length > 0) && (
            <button
              type="button"
              className="chip"
              aria-pressed={watched}
              onClick={() => void toggleWatched()}
            >
              {watched ? '✓ Watched' : 'Mark as watched'}
            </button>
          )}
          {tracks.length > 1 && (
            <label className="detail__audio">
              <span className="muted">Audio </span>
              <select
                className="chip"
                value={audio}
                onChange={(event) => setAudio(Number(event.currentTarget.value))}
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
