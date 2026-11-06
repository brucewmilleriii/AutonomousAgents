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

  it('rejects unknown body fields and names the key', async () => {
    const { res } = await createTask({ title: 'x', colour: 'red' });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ issues: { message: string }[] }>();
    expect(JSON.stringify(body.issues)).toContain('colour');
  });

  it.each(['id', 'createdAt', 'updatedAt', 'history'])(
    'rejects server-managed field %s in the body',
    async (key) => {
      const { res } = await createTask({ title: 'x', [key]: key === 'history' ? [] : 'v' });
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.json<{ issues: unknown }>().issues)).toContain(key);
    },
  );
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

  it('filters by owner with an exact match', async () => {
    await createTask({ title: 'A', owner: 'alice' });
    await createTask({ title: 'B', owner: 'bob' });
    await createTask({ title: 'C', owner: 'Alice' });
    await createTask({ title: 'D', owner: 'alice2' });
    await createTask({ title: 'E' });

    const res = await app.inject({ method: 'GET', url: '/tasks?owner=alice' });
    expect(res.statusCode).toBe(200);
    expect(res.json<Task[]>().map((t) => t.title)).toEqual(['A']);
  });

  it('returns 200 and an empty list when no task has that owner', async () => {
    await createTask({ title: 'A', owner: 'alice' });
    const res = await app.inject({ method: 'GET', url: '/tasks?owner=nobody' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('combines owner and status filters', async () => {
    const { task: a } = await createTask({ title: 'A', owner: 'alice' });
    await createTask({ title: 'B', owner: 'alice' });
    const { task: c } = await createTask({ title: 'C', owner: 'bob' });
    await app.inject({ method: 'PATCH', url: `/tasks/${a.id}`, payload: { status: 'done' } });
    await app.inject({ method: 'PATCH', url: `/tasks/${c.id}`, payload: { status: 'done' } });

    const res = await app.inject({ method: 'GET', url: '/tasks?owner=alice&status=done' });
    expect(res.statusCode).toBe(200);
    expect(res.json<Task[]>().map((t) => t.title)).toEqual(['A']);

    const none = await app.inject({ method: 'GET', url: '/tasks?owner=bob&status=todo' });
    expect(none.statusCode).toBe(200);
    expect(none.json()).toEqual([]);
  });

  it('rejects an empty owner filter', async () => {
    await createTask({ title: 'A', owner: 'alice' });
    const res = await app.inject({ method: 'GET', url: '/tasks?owner=' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('issues');
  });

  it('trims surrounding whitespace in the owner filter', async () => {
    await createTask({ title: 'A', owner: ' alice ' });
    await createTask({ title: 'B', owner: 'bob' });
    const res = await app.inject({ method: 'GET', url: '/tasks?owner=%20alice%20' });
    expect(res.statusCode).toBe(200);
    expect(res.json<Task[]>().map((t) => t.title)).toEqual(['A']);
  });

  it('rejects a whitespace-only owner filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks?owner=%20%20%20' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('issues');
  });

  it('rejects an owner filter longer than 100 chars after trimming', async () => {
    const tooLong = await app.inject({ method: 'GET', url: `/tasks?owner=${'a'.repeat(101)}` });
    expect(tooLong.statusCode).toBe(400);
    const paddedTooLong = await app.inject({
      method: 'GET',
      url: `/tasks?owner=%20${'a'.repeat(101)}%20`,
    });
    expect(paddedTooLong.statusCode).toBe(400);
    const paddedOk = await app.inject({
      method: 'GET',
      url: `/tasks?owner=%20${'a'.repeat(100)}%20`,
    });
    expect(paddedOk.statusCode).toBe(200);
  });

  it('keeps inner whitespace in the owner filter', async () => {
    await createTask({ title: 'A', owner: 'a b' });
    await createTask({ title: 'B', owner: 'ab' });
    await createTask({ title: 'C', owner: 'a  b' });
    const res = await app.inject({ method: 'GET', url: '/tasks?owner=a%20b' });
    expect(res.statusCode).toBe(200);
    expect(res.json<Task[]>().map((t) => t.title)).toEqual(['A']);
  });

  describe('pagination', () => {
    async function seed(n: number) {
      for (let i = 1; i <= n; i++) await createTask({ title: `T${i}` });
    }
    const titles = (res: { json<T>(): T }) => res.json<Task[]>().map((t) => t.title);

    it('defaults to limit 100 and offset 0 and sets X-Total-Count', async () => {
      await seed(3);
      const res = await app.inject({ method: 'GET', url: '/tasks' });
      expect(res.statusCode).toBe(200);
      expect(titles(res)).toEqual(['T1', 'T2', 'T3']);
      expect(res.headers['x-total-count']).toBe('3');
    });

    it('returns the 2nd and 3rd tasks for limit=2&offset=1', async () => {
      await seed(5);
      const res = await app.inject({ method: 'GET', url: '/tasks?limit=2&offset=1' });
      expect(res.statusCode).toBe(200);
      expect(titles(res)).toEqual(['T2', 'T3']);
      expect(res.headers['x-total-count']).toBe('5');
    });

    it('caps results at limit=100 by default', async () => {
      await seed(101);
      const res = await app.inject({ method: 'GET', url: '/tasks' });
      expect(res.json<Task[]>()).toHaveLength(100);
      expect(res.headers['x-total-count']).toBe('101');
    });

    it('accepts the boundary values limit=1 and limit=100', async () => {
      await seed(3);
      const one = await app.inject({ method: 'GET', url: '/tasks?limit=1' });
      expect(titles(one)).toEqual(['T1']);
      const hundred = await app.inject({ method: 'GET', url: '/tasks?limit=100' });
      expect(hundred.statusCode).toBe(200);
    });

    it('returns 200 and [] when offset is past the end', async () => {
      await seed(3);
      const res = await app.inject({ method: 'GET', url: '/tasks?offset=3' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
      expect(res.headers['x-total-count']).toBe('3');
    });

    it.each([
      'limit=0',
      'limit=101',
      'limit=abc',
      'limit=1.5',
      'limit=',
      'limit=-1',
      'offset=-1',
      'offset=abc',
      'offset=1.5',
      'offset=',
      'offset=99999999999999999999',
    ])('rejects ?%s with 400 and issues', async (qs) => {
      await seed(2);
      const res = await app.inject({ method: 'GET', url: `/tasks?${qs}` });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toHaveProperty('issues');
    });

    it('pages after status and owner filters and counts the filtered total', async () => {
      for (let i = 1; i <= 4; i++) {
        const { task } = await createTask({ title: `A${i}`, owner: 'alice' });
        if (i !== 2) {
          await app.inject({
            method: 'PATCH',
            url: `/tasks/${task.id}`,
            payload: { status: 'done' },
          });
        }
      }
      await createTask({ title: 'B1', owner: 'bob' });

      const res = await app.inject({
        method: 'GET',
        url: '/tasks?owner=alice&status=done&limit=2&offset=1',
      });
      expect(res.statusCode).toBe(200);
      expect(titles(res)).toEqual(['A3', 'A4']);
      expect(res.headers['x-total-count']).toBe('3');
    });

    it('does not set X-Total-Count on a 400', async () => {
      const res = await app.inject({ method: 'GET', url: '/tasks?limit=0' });
      expect(res.headers['x-total-count']).toBeUndefined();
    });
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

  it('rejects unknown body fields and leaves the task unchanged', async () => {
    const { task } = await createTask();
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      payload: { stauts: 'done' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json<{ issues: unknown }>().issues)).toContain('stauts');
    const after = await app.inject({ method: 'GET', url: `/tasks/${task.id}` });
    expect(after.json<Task>()).toEqual(task);
  });

  it.each(['id', 'createdAt', 'updatedAt', 'history'])(
    'rejects server-managed field %s alongside a valid field',
    async (key) => {
      const { task } = await createTask();
      const res = await app.inject({
        method: 'PATCH',
        url: `/tasks/${task.id}`,
        payload: { title: 'new', [key]: key === 'history' ? [] : 'v' },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.json<{ issues: unknown }>().issues)).toContain(key);
      const after = await app.inject({ method: 'GET', url: `/tasks/${task.id}` });
      expect(after.json<Task>()).toEqual(task);
    },
  );

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

describe('dueDate', () => {
  const invalidDates: unknown[] = [
    '2026-13-01',
    '2026-02-30',
    '2026-02-29',
    'tomorrow',
    '2026-01-01T00:00:00Z',
    20260101,
  ];

  it('defaults to null on create and accepts a date', async () => {
    const { res, task } = await createTask();
    expect(res.statusCode).toBe(201);
    expect(task.dueDate).toBeNull();

    const { task: dated } = await createTask({ title: 'Due', dueDate: '2026-03-15' });
    expect(dated.dueDate).toBe('2026-03-15');
    expect(dated.history).toEqual([]);
  });

  it('accepts a leap day only in a leap year', async () => {
    const ok = await createTask({ title: 'Leap', dueDate: '2028-02-29' });
    expect(ok.res.statusCode).toBe(201);
    expect(ok.task.dueDate).toBe('2028-02-29');
    const bad = await createTask({ title: 'Not leap', dueDate: '2026-02-29' });
    expect(bad.res.statusCode).toBe(400);
  });

  it.each(invalidDates)('rejects invalid dueDate %j on create', async (dueDate) => {
    const { res } = await createTask({ title: 'T', dueDate });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.length).toBeGreaterThan(0);
  });

  it.each(invalidDates)('rejects invalid dueDate %j on update', async (dueDate) => {
    const { task } = await createTask();
    const res = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      payload: { dueDate },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.length).toBeGreaterThan(0);
  });

  it('sets, changes and clears dueDate with history', async () => {
    const { task } = await createTask();
    const patch = (dueDate: string | null) =>
      app.inject({ method: 'PATCH', url: `/tasks/${task.id}`, payload: { dueDate } });

    const set = (await patch('2026-03-15')).json<Task>();
    expect(set.dueDate).toBe('2026-03-15');
    const changed = (await patch('2026-04-01')).json<Task>();
    expect(changed.dueDate).toBe('2026-04-01');
    const cleared = (await patch(null)).json<Task>();
    expect(cleared.dueDate).toBeNull();

    expect(cleared.history.map((h) => [h.field, h.from, h.to])).toEqual([
      ['dueDate', null, '2026-03-15'],
      ['dueDate', '2026-03-15', '2026-04-01'],
      ['dueDate', '2026-04-01', null],
    ]);
  });

  it('is a no-op when the same dueDate is set again', async () => {
    const { task } = await createTask({ title: 'T', dueDate: '2026-03-15' });
    const same = await app.inject({
      method: 'PATCH',
      url: `/tasks/${task.id}`,
      payload: { dueDate: '2026-03-15' },
    });
    expect(same.json<Task>()).toEqual(task);

    const { task: undated } = await createTask();
    const nullAgain = await app.inject({
      method: 'PATCH',
      url: `/tasks/${undated.id}`,
      payload: { dueDate: null },
    });
    expect(nullAgain.json<Task>()).toEqual(undated);
  });
});
