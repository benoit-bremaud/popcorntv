import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { apiError, callerOf, invalid } from '../http.js';
import type { ProfileRepository } from '../profiles/repository.js';
import { profileParams } from '../profiles/routes.js';
import type { ProgressRepository } from './repository.js';

const mediaParams = profileParams.extend({ id: z.uuid() });
/** A week of media time: far beyond any file, small enough to keep rows sane. */
export const MAX_POSITION_SEC = 7 * 86_400;
const progressBody = z.object({ positionSec: z.int().min(0).max(MAX_POSITION_SEC) });

/**
 * UC6 per profile (spec resume-playback §2.2, spec profiles §4.2):
 * `PUT /profiles/:profileId/media/:id/progress` (204 | 400 | 404 `profile_not_found` /
 * `media_not_found`), `GET /profiles/:profileId/progress`, and `PUT | DELETE
 * /profiles/:profileId/media/:id/watched` (204 | 400 | 404, spec watched-marks R2, R3).
 */
export function registerProgressRoutes(
  app: FastifyInstance,
  deps: {
    readonly progress: ProgressRepository;
    readonly profiles: Pick<ProfileRepository, 'exists'>;
  },
): void {
  app.put('/profiles/:profileId/media/:id/progress', (request, reply) => {
    const params = mediaParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const body = progressBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    if (!deps.profiles.exists(callerOf(request).userId, params.data.profileId)) {
      return reply.code(404).send(apiError('profile_not_found'));
    }
    if (!deps.progress.save(params.data.profileId, params.data.id, body.data.positionSec)) {
      return reply.code(404).send(apiError('media_not_found'));
    }
    return reply.code(204).send();
  });

  app.get('/profiles/:profileId/progress', (request, reply) => {
    const params = profileParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    if (!deps.profiles.exists(callerOf(request).userId, params.data.profileId)) {
      return reply.code(404).send(apiError('profile_not_found'));
    }
    // Fastify serializes this object/array as application/json; no HTML response is written.
    // nosemgrep: javascript.express.security.audit.xss.direct-response-write.direct-response-write
    return reply.send(deps.progress.list(params.data.profileId));
  });

  for (const method of ['PUT', 'DELETE'] as const) {
    app.route({
      method,
      url: '/profiles/:profileId/media/:id/watched',
      handler: (request, reply) => {
        const params = mediaParams.safeParse(request.params);
        if (!params.success) return reply.code(400).send(invalid(params.error.issues));
        if (!deps.profiles.exists(callerOf(request).userId, params.data.profileId)) {
          return reply.code(404).send(apiError('profile_not_found'));
        }
        const { profileId, id } = params.data;
        if (!deps.progress.setWatched(profileId, id, method === 'PUT')) {
          return reply.code(404).send(apiError('media_not_found'));
        }
        return reply.code(204).send();
      },
    });
  }
}
