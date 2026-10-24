import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AVATAR_COLORS, DEFAULT_PROFILE_ID, PROFILE_NAME_MAX } from '@popcorntv/shared';
import { apiError, invalid } from '../http.js';
import type { ProfileRepository } from './repository.js';

/** `:profileId` is the seeded `default` or a UUID (spec profiles §4.2). */
const profileId = z.union([z.literal(DEFAULT_PROFILE_ID), z.uuid()]);
export const profileParams = z.object({ profileId });
const name = z.string().trim().min(1).max(PROFILE_NAME_MAX);
const avatar = z.enum(AVATAR_COLORS);
const createBody = z.object({ name, avatar });
const updateBody = z.object({ name: name.optional(), avatar: avatar.optional() });

/** UC8 / UC9 (spec profiles §4.2): list, create, rename / recolour and delete profiles. */
export function registerProfileRoutes(
  app: FastifyInstance,
  deps: { readonly profiles: ProfileRepository },
): void {
  app.get('/profiles', (_request, reply) => reply.send(deps.profiles.list()));

  app.post('/profiles', (request, reply) => {
    const body = createBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const result = deps.profiles.create(body.data);
    if (!result.ok) return reply.code(409).send(apiError(result.reason));
    return reply.code(201).send(result.profile);
  });

  app.patch('/profiles/:profileId', (request, reply) => {
    const params = profileParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const body = updateBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const result = deps.profiles.update(params.data.profileId, body.data);
    if (!result.ok) {
      const status = result.reason === 'profile_not_found' ? 404 : 409;
      return reply.code(status).send(apiError(result.reason));
    }
    return reply.send(result.profile);
  });

  app.delete('/profiles/:profileId', (request, reply) => {
    const params = profileParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const result = deps.profiles.remove(params.data.profileId);
    if (result === 'profile_not_found') return reply.code(404).send(apiError(result));
    if (result === 'last_profile') return reply.code(409).send(apiError(result));
    return reply.code(204).send();
  });
}
