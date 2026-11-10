import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MY_PROVIDERS_MAX } from '@popcorntv/shared';
import type { MyProvider, NotificationList } from '@popcorntv/shared';
import { apiError, callerOf, invalid } from '../http.js';
import type { ProfileRepository } from '../profiles/repository.js';
import { profileParams } from '../profiles/routes.js';
import type { MyProviderRepository } from './my-provider-repository.js';
import type { NotificationRepository } from './notification-repository.js';

const providerParams = profileParams.extend({
  providerId: z.coerce.number().int().positive().max(2_147_483_647),
});
const providerBody = z.object({ name: z.string().trim().min(1).max(100) });

/**
 * UC28 / UC29 (spec wishlist-notifications R1, R10): `GET …/notifications`, `PUT
 * …/notifications/read`, `GET …/providers`, `PUT | DELETE …/providers/:providerId` under
 * `/profiles/:profileId`, each on one of the caller's profiles.
 */
export function registerNotificationRoutes(
  app: FastifyInstance,
  deps: {
    readonly notifications: NotificationRepository;
    readonly myProviders: MyProviderRepository;
    readonly profiles: Pick<ProfileRepository, 'exists'>;
  },
): void {
  /** The parsed params, or null once a 400 / 404 is sent. */
  function own<T extends { profileId: string }>(
    schema: z.ZodType<T>,
    request: FastifyRequest,
    reply: FastifyReply,
  ): T | null {
    const params = schema.safeParse(request.params);
    if (!params.success) {
      reply.code(400).send(invalid(params.error.issues));
      return null;
    }
    if (!deps.profiles.exists(callerOf(request).userId, params.data.profileId)) {
      reply.code(404).send(apiError('profile_not_found'));
      return null;
    }
    return params.data;
  }

  app.get('/profiles/:profileId/notifications', (request, reply) => {
    const params = own(profileParams, request, reply);
    if (!params) return reply;
    return reply.send(deps.notifications.list(params.profileId) satisfies NotificationList);
  });

  app.put('/profiles/:profileId/notifications/read', (request, reply) => {
    const params = own(profileParams, request, reply);
    if (!params) return reply;
    deps.notifications.markRead(params.profileId);
    return reply.code(204).send();
  });

  app.get('/profiles/:profileId/providers', (request, reply) => {
    const params = own(profileParams, request, reply);
    if (!params) return reply;
    return reply.send(deps.myProviders.list(params.profileId) satisfies MyProvider[]);
  });

  app.put('/profiles/:profileId/providers/:providerId', (request, reply) => {
    const params = own(providerParams, request, reply);
    if (!params) return reply;
    const body = providerBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const provider = { providerId: params.providerId, name: body.data.name };
    if (!deps.myProviders.put(params.profileId, provider, MY_PROVIDERS_MAX)) {
      return reply.code(409).send(apiError('too_many_providers'));
    }
    return reply.code(204).send();
  });

  app.delete('/profiles/:profileId/providers/:providerId', (request, reply) => {
    const params = own(providerParams, request, reply);
    if (!params) return reply;
    deps.myProviders.remove(params.profileId, params.providerId);
    return reply.code(204).send();
  });
}
