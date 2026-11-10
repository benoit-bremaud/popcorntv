import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { normaliseTitleLink, TITLE_LINK_MAX } from '@popcorntv/shared';
import type { TitleLink } from '@popcorntv/shared';
import { callerOf, invalid } from '../http.js';
import { titleParams } from './routes.js';
import type { TitleLinkRepository } from './title-link-repository.js';

const OWNER = { config: { access: 'owner' } } as const;
// Raw length is capped before parsing; the shared rule checks scheme, host and credentials (R4).
const linkBody = z.object({
  url: z
    .string()
    .max(TITLE_LINK_MAX + 64)
    .transform((raw, ctx) => {
      const url = normaliseTitleLink(raw);
      if (url === null) {
        ctx.addIssue({ code: 'custom', message: 'an http(s) link without credentials' });
        return z.NEVER;
      }
      return url;
    }),
});

/**
 * UC30 (spec title-link R2–R7): `GET /title-links/:kind/:tmdbId` for any signed-in caller,
 * `PUT | DELETE` for an owner. The server stores the string only, it never fetches it (R5).
 */
export function registerTitleLinkRoutes(
  app: FastifyInstance,
  deps: { readonly links: TitleLinkRepository },
): void {
  app.get('/title-links/:kind/:tmdbId', (request, reply) => {
    const params = titleParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    return reply.send({
      url: deps.links.get(params.data.kind, params.data.tmdbId),
      editable: callerOf(request).role === 'owner',
    } satisfies TitleLink);
  });

  app.put('/title-links/:kind/:tmdbId', OWNER, (request, reply) => {
    const params = titleParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const body = linkBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const { kind, tmdbId } = params.data;
    deps.links.set(kind, tmdbId, body.data.url);
    // Never the URL: it may carry a private token (R7).
    request.log.info(
      { event: 'title_link.set', kind, tmdbId, userId: callerOf(request).userId },
      'title link set',
    );
    return reply.code(204).send();
  });

  app.delete('/title-links/:kind/:tmdbId', OWNER, (request, reply) => {
    const params = titleParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const { kind, tmdbId } = params.data;
    if (deps.links.remove(kind, tmdbId)) {
      request.log.info(
        { event: 'title_link.removed', kind, tmdbId, userId: callerOf(request).userId },
        'title link removed',
      );
    }
    return reply.code(204).send();
  });
}
