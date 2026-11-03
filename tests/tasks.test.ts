import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createMemoryStore } from '../src/tasks/store.js';
import type { Task } from '../src/tasks/schema.js';

let app: FastifyInstance;

beforeEach(() => {
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
  app = buildApp({ store: createMemoryStore(clock) });
});

afterEach(async () => {
  await app.close();
});

async function createTask(body: Record<string, unknown> = { title: 'Write tests' }) {
  const res = await app.inject({ method: 'POST', url: '/tasks', payload: body });
  return { res, task: res.json<Task>() };
}

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /tasks', () => {
  it('creates a task with defaults', async () => {
    const { res, task } = await createTask({ title: '  Ship v1  ' });
    expect(res.statusCode).toBe(201);
    expect(task).toMatchObject({
      title: 'Ship v1',
      description: '',
      owner: null,
      status: 'todo',
      history: [],
    });
    expect(task.createdAt).toBe(task.updatedAt);
  });

  it.each([
    [{}, 'missing title'],
    [{ title: '' }, 'empty title'],
    [{ title: '   ' }, 'blank title'],
    [{ title: 'x'.repeat(201) }, 'title too long'],
    [{ title: 'ok', owner: '' }, 'empty owner'],
  ])('rejects %j (%s)', async (body, _reason) => {
    const { res } = await createTask(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('issues');
  });
});

describe('GET /tasks', () => {
  it('lists tasks and filters by status', async () => {
    const { task: a } = await createTask({ title: 'A' });
    await createTask({ title: 'B' });
    await app.inject({ method: 'PATCH', url: `/tasks/${a.id}`, payload: { status: 'done' } });

    const all = await app.inject({ method: 'GET', url: '/tasks' });
    expect(all.json<Task[]>()).toHaveLength(2);

    const done = await app.inject({ method: 'GET', url: '/tasks?status=done' });
    expect(done.json<Task[]>().map((t) => t.title)).toEqual(['A']);
  });

  it('rejects an unknown status filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks?status=nope' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /tasks/:id', () => {
  it('returns a task', async () => {
    const { task } = await createTask();
    const res = await app.inject({ method: 'GET', url: `/tasks/${task.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json<Task>().id).toBe(task.id);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: `/tasks/${crypto.randomUUID()}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks/not-a-uuid' });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /tasks/:id', () => {
  it('updates fields and records history', async () => {
    const { task } = await createTask();
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      payload: { status: 'in_progress', owner: 'builder' },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json<Task>();
    expect(updated).toMatchObject({ status: 'in_progress', owner: 'builder' });
    expect(updated.updatedAt > task.updatedAt).toBe(true);
    expect(updated.history.map((h) => [h.field, h.from, h.to])).toEqual([
      ['owner', null, 'builder'],
      ['status', 'todo', 'in_progress'],
    ]);
  });

  it('clears the owner with null', async () => {
    const { task } = await createTask({ title: 'T', owner: 'a' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      payload: { owner: null },
    });
    expect(res.json<Task>().owner).toBeNull();
  });

  it('is a no-op when nothing changes', async () => {
    const { task } = await createTask();
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      payload: { title: task.title },
    });
    expect(res.json<Task>()).toEqual(task);
  });

  it('rejects an empty body', async () => {
    const { task } = await createTask();
    const res = await app.inject({ method: 'PATCH', url: `/tasks/${task.id}`, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid status', async () => {
    const { task } = await createTask();
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      payload: { status: 'shipped' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for a malformed id and 404 for an unknown id', async () => {
    const bad = await app.inject({ method: 'PATCH', url: '/tasks/x', payload: { title: 'y' } });
    expect(bad.statusCode).toBe(400);
    const missing = await app.inject({
      method: 'PATCH',
      url: `/tasks/${crypto.randomUUID()}`,
      payload: { title: 'y' },
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes a task once', async () => {
    const { task } = await createTask();
    const first = await app.inject({ method: 'DELETE', url: `/tasks/${task.id}` });
    expect(first.statusCode).toBe(204);
    const second = await app.inject({ method: 'DELETE', url: `/tasks/${task.id}` });
    expect(second.statusCode).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/tasks/x' });
    expect(res.statusCode).toBe(400);
  });
});
