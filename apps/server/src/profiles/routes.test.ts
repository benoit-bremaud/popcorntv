import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Profile } from '@popcorntv/shared';
import { openDatabase } from '../db/index.js';
import { ProfileRepository } from './repository.js';
import { registerProfileRoutes } from './routes.js';

const UNKNOWN = '00000000-0000-4000-8000-000000000000';

function setup() {
  const app = Fastify();
  registerProfileRoutes(app, { profiles: new ProfileRepository(openDatabase(':memory:')) });
  return app;
}

describe('profile routes', () => {
  it('creates a profile with a trimmed name and lists it', async () => {
    const app = setup();

    const created = await app.inject({
      method: 'POST',
      url: '/profiles',
      payload: { name: '  Kid ', avatar: 'blue' },
    });
    const list = await app.inject({ method: 'GET', url: '/profiles' });

    expect(created.statusCode).toBe(201);
    expect(created.json<Profile>()).toMatchObject({ name: 'Kid', avatar: 'blue' });
    expect(list.json<Profile[]>().map((p) => p.name)).toEqual(['Me', 'Kid']);
  });

  it.each([
    { name: '', avatar: 'blue' },
    { name: '   ', avatar: 'blue' },
    { name: 'x'.repeat(41), avatar: 'blue' },
    { name: 'Kid', avatar: 'gold' },
    { name: 'Kid' },
  ])('rejects the body %j', async (payload) => {
    const response = await setup().inject({ method: 'POST', url: '/profiles', payload });

    expect(response.statusCode).toBe(400);
  });

  it('answers 409 profile_name_taken for a duplicate name', async () => {
    const response = await setup().inject({
      method: 'POST',
      url: '/profiles',
      payload: { name: 'me', avatar: 'blue' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'profile_name_taken' });
  });

  it('renames a profile', async () => {
    const response = await setup().inject({
      method: 'PATCH',
      url: '/profiles/default',
      payload: { name: 'Dad' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: 'default', name: 'Dad', avatar: 'red' });
  });

  it('answers 404 / 409 / 400 on PATCH errors', async () => {
    const app = setup();
    await app.inject({
      method: 'POST',
      url: '/profiles',
      payload: { name: 'Kid', avatar: 'blue' },
    });

    const unknown = await app.inject({ method: 'PATCH', url: `/profiles/${UNKNOWN}`, payload: {} });
    const taken = await app.inject({
      method: 'PATCH',
      url: '/profiles/default',
      payload: { name: 'KID' },
    });
    const badId = await app.inject({ method: 'PATCH', url: '/profiles/bob', payload: {} });
    const badBody = await app.inject({
      method: 'PATCH',
      url: '/profiles/default',
      payload: { avatar: 'gold' },
    });

    expect(unknown.statusCode).toBe(404);
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'profile_name_taken' });
    expect(badId.statusCode).toBe(400);
    expect(badBody.statusCode).toBe(400);
  });

  it('deletes a profile, refuses the last one, 404s an unknown one', async () => {
    const app = setup();
    const kid = await app.inject({
      method: 'POST',
      url: '/profiles',
      payload: { name: 'Kid', avatar: 'blue' },
    });

    const removed = await app.inject({ method: 'DELETE', url: '/profiles/default' });
    const last = await app.inject({
      method: 'DELETE',
      url: `/profiles/${kid.json<Profile>().id}`,
    });
    const unknown = await app.inject({ method: 'DELETE', url: `/profiles/${UNKNOWN}` });
    const badId = await app.inject({ method: 'DELETE', url: '/profiles/bob' });

    expect(removed.statusCode).toBe(204);
    expect(last.statusCode).toBe(409);
    expect(last.json()).toEqual({ error: 'last_profile' });
    expect(unknown.statusCode).toBe(404);
    expect(badId.statusCode).toBe(400);
  });
});
