import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { accounts, demoPassword, seed, statuses } from './seed.js';

const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']]
]);
const sessionLifetime = 8 * 60 * 60 * 1000;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new RequestError(415, 'Send an application/json request.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 8192) chunks.push(chunk);
  }
  if (size > 8192) throw new RequestError(413, 'Request is too large.');
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new RequestError(400, 'Send a valid JSON object.');
  }
}

function field(body, key, label, max, required = false) {
  const raw = body[key] === undefined ? '' : body[key];
  if (typeof raw !== 'string') throw new RequestError(422, `${label} must be text.`);
  const value = raw.trim();
  if (required && !value) throw new RequestError(422, `${label} is required.`);
  if (value.length > max) throw new RequestError(422, `${label} must be at most ${max} characters.`);
  return value;
}

export function createApp({ dataFile } = {}) {
  let data = seed();
  if (dataFile) {
    try {
      data = JSON.parse(readFileSync(dataFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const sessions = new Map();
  function save(next) {
    if (dataFile) {
      mkdirSync(dirname(dataFile), { recursive: true });
      writeFileSync(dataFile + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
      renameSync(dataFile + '.tmp', dataFile);
    }
    data = next;
  }

  return createServer(async (req, res) => {
    const method = req.method;
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const path = req.url.split('?', 1)[0];
      if (method === 'GET' && assets.has(path)) {
        const [file, type] = assets.get(path);
        const content = readFileSync(new URL('./public/' + file, import.meta.url));
        res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
        return res.end(content);
      }
      if (!path.startsWith('/api/')) throw new RequestError(404, 'Page not found.');

      const token = req.headers.cookie?.match(/(?:^|;\s*)relay_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      const session = sessions.get(token);
      const user = session?.expires > Date.now() ? session.user : null;
      const cookie = 'HttpOnly; SameSite=Strict; Path=/';
      if (method === 'POST' && path === '/api/login') {
        const body = await readBody(req);
        const account = accounts.find(candidate => candidate.email === (typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''));
        if (!account || body.password !== demoPassword) throw new RequestError(401, 'Email or password is incorrect.');
        for (const [key, entry] of sessions) {
          if (entry.expires <= Date.now() || key === token) sessions.delete(key);
        }
        const nextToken = randomBytes(32).toString('hex');
        sessions.set(nextToken, { user: account, expires: Date.now() + sessionLifetime });
        res.setHeader('Set-Cookie', `relay_session=${nextToken}; ${cookie}; Max-Age=${sessionLifetime / 1000}`);
        return send(200, { user: account });
      }
      if (method === 'POST' && path === '/api/logout') {
        sessions.delete(token);
        res.setHeader('Set-Cookie', `relay_session=; ${cookie}; Max-Age=0`);
        return send(200, {});
      }
      if (!user) throw new RequestError(401, 'Sign in to continue.');

      const canAccess = project => user.role === 'admin' || project.ownerId === user.id;
      const getProject = id => {
        const project = data.projects.find(item => item.id === id && canAccess(item));
        if (!project) throw new RequestError(404, 'Project not found.');
        return project;
      };
      if (method === 'GET' && path === '/api/workspace') {
        const projects = data.projects.filter(canAccess);
        const ids = new Set(projects.map(project => project.id));
        return send(200, { user, projects, tasks: data.tasks.filter(task => ids.has(task.projectId)), statuses });
      }
      if (method === 'POST' && path === '/api/projects') {
        const body = await readBody(req);
        const name = field(body, 'name', 'Project name', 80, true);
        const description = field(body, 'description', 'Description', 500);
        const project = { id: data.projects.length + 1, name, description, ownerId: user.id };
        save({ ...data, projects: [...data.projects, project] });
        return send(201, { project });
      }
      const match = path.match(/^\/api\/tasks(?:\/(\d+))?$/);
      if (match && ((method === 'POST' && !match[1]) || (method === 'PATCH' && match[1]))) {
        const body = await readBody(req);
        const editing = method === 'PATCH';
        const existing = editing ? data.tasks.find(task => task.id === Number(match[1])) : undefined;
        if (editing && !existing) throw new RequestError(404, 'Task not found.');
        const projectId = existing?.projectId ?? body.projectId;
        getProject(projectId);
        const task = {
          id: existing?.id ?? data.tasks.length + 1,
          projectId,
          title: field({ ...existing, ...body }, 'title', 'Task title', 100, true),
          description: field({ ...existing, ...body }, 'description', 'Description', 500),
          status: Object.hasOwn(body, 'status') ? body.status : existing?.status ?? statuses[0]
        };
        if (!statuses.includes(task.status)) throw new RequestError(422, 'Select a valid status.');
        const tasks = editing ? data.tasks.map(item => item.id === task.id ? task : item) : [...data.tasks, task];
        save({ ...data, tasks });
        return send(editing ? 200 : 201, { task });
      }
      throw new RequestError(404, 'Endpoint not found.');
    } catch (error) {
      if (error instanceof RequestError) return send(error.status, { error: error.message });
      console.error(error);
      send(500, { error: 'The request could not be completed.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 3000);
  const dataFile = resolve(process.env.RELAY_DATA_FILE ?? '.data/workspace.json');
  createApp({ dataFile }).listen(port, '127.0.0.1', function () {
    console.log(`Relay is running at http://127.0.0.1:${this.address().port}`);
  });
}
