import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateTaskInput, TaskStatus, UpdateTaskInput } from './schema.js';
import type { TaskStore } from './store.js';

const IdParams = z.object({ id: z.string().uuid() });
const ListQuery = z.object({
  status: TaskStatus.optional(),
  owner: z.string().trim().min(1).max(100).optional(),
  dueBefore: z.iso.date().optional(),
  dueAfter: z.iso.date().optional(),
  overdue: z
    .literal('true')
    .transform(() => true)
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'must be an integer')
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .default(100),
  offset: z
    .string()
    .regex(/^\d+$/, 'must be an integer')
    .transform(Number)
    .pipe(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER))
    .default(0),
});

function badRequest(error: z.ZodError) {
  return {
    error: 'Bad Request',
    issues: error.issues.map((i) => ({ path: i.path, message: i.message })),
  };
}

export function registerTaskRoutes(app: FastifyInstance, store: TaskStore): void {
  app.get('/tasks', async (req, reply) => {
    const query = ListQuery.safeParse(req.query);
    if (!query.success) return reply.code(400).send(badRequest(query.error));
    const { limit, offset, ...filter } = query.data;
    const matching = store.list(filter);
    return reply
      .header('X-Total-Count', String(matching.length))
      .send(matching.slice(offset, offset + limit));
  });

  app.get('/tasks/:id', async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send(badRequest(params.error));
    const task = store.get(params.data.id);
    if (!task) return reply.code(404).send({ error: 'Not Found' });
    return task;
  });

  app.post('/tasks', async (req, reply) => {
    const body = CreateTaskInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send(badRequest(body.error));
    return reply.code(201).send(store.create(body.data));
  });

  app.patch('/tasks/:id', async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send(badRequest(params.error));
    const body = UpdateTaskInput.safeParse(req.body);
    if (!body.success) return reply.code(400).send(badRequest(body.error));
    const task = store.update(params.data.id, body.data);
    if (!task) return reply.code(404).send({ error: 'Not Found' });
    return task;
  });

  app.delete('/tasks/:id', async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return reply.code(400).send(badRequest(params.error));
    if (!store.remove(params.data.id)) return reply.code(404).send({ error: 'Not Found' });
    return reply.code(204).send();
  });
}
