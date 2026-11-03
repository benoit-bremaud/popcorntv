import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { subtitleTracks } from '@popcorntv/shared';
import { apiError, invalid } from '../http.js';
import type { LibraryRepository } from '../library/repository.js';
import { confinedPath } from './routes.js';
import type { SubtitleExtractor } from './subtitle-extractor.js';
import { shiftWebVtt } from './webvtt.js';

/** What the subtitle route needs; built by `buildApp`. */
export interface SubtitleRoutesDeps {
  readonly repository: LibraryRepository;
  readonly extractor: SubtitleExtractor;
  /** Absolute folder every served file must resolve under (`ServerConfig.mediaRoot`). */
  readonly mediaRoot: string;
}

const params = z.object({ id: z.uuid(), index: z.coerce.number().int().min(0) });
const query = z.object({ offsetSec: z.coerce.number().int().min(0).default(0) });

/**
 * `GET /media/:id/subtitles/:index?offsetSec=` (200 `text/vtt` | 400 `invalid_request` |
 * 404 `media_not_found` / `subtitle_not_found` | 500 `transcode_failed`) — UC10 (spec
 * subtitles, ADR-0009). The cues are shifted by the HLS session's `offsetSec`.
 */
export function registerSubtitleRoutes(app: FastifyInstance, deps: SubtitleRoutesDeps): void {
  app.get('/media/:id/subtitles/:index', async (request, reply) => {
    const path = params.safeParse(request.params);
    if (!path.success) return reply.code(400).send(invalid(path.error.issues));
    const search = query.safeParse(request.query);
    if (!search.success) return reply.code(400).send(invalid(search.error.issues));
    const { id, index } = path.data;

    const stored = deps.repository.findMediaFile(id);
    const file =
      stored === null ? null : await confinedPath(stored.filePath, stored.rootPath, deps.mediaRoot);
    if (file === null) return reply.code(404).send(apiError('media_not_found'));
    const offered = subtitleTracks(deps.repository.findMediaStreams(id));
    if (!offered.some((track) => track.index === index)) {
      return reply.code(404).send(apiError('subtitle_not_found'));
    }

    let text: string;
    try {
      text = await deps.extractor.get(id, index, file);
    } catch (error) {
      request.log.error({ err: error, mediaId: id, index }, 'subtitle extraction failed');
      return reply.code(500).send(apiError('transcode_failed'));
    }
    return reply
      .code(200)
      .type('text/vtt; charset=utf-8')
      .send(shiftWebVtt(text, search.data.offsetSec));
  });
}
