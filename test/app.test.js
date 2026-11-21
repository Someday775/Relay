import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

async function serve(t, options) {
  const server = createApp(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  return async (path, { method = 'GET', body, cookie } = {}) => {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const response = await fetch(origin + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = response.headers.get('content-type').startsWith('application/json');
    return { status: response.status, data: json ? await response.json() : await response.text(), cookie: response.headers.get('set-cookie') };
  };
}

async function signIn(request, name) {
  const result = await request('/api/login', {
    method: 'POST', body: { email: name + '@relay.test', password: 'relay-demo' }
  });
  assert.equal(result.status, 200);
  assert.match(result.cookie, /HttpOnly/);
  return result.cookie.split(';')[0];
}

test('serves the UI and requires a valid session', async t => {
  const request = await serve(t);
  assert.match((await request('/')).data, /Sign in to Relay/);
  assert.equal((await request('/app.js')).status, 200);
  assert.equal((await request('/style.css')).status, 200);
  assert.equal((await request('/api/workspace')).status, 401);
  assert.equal((await request('/api/login', {
    method: 'POST', body: { email: 'member@relay.test', password: 'wrong' }
  })).status, 401);
  const cookie = await signIn(request, 'member');
  assert.equal((await request('/api/workspace', { cookie })).data.user.role, 'member');
  assert.equal((await request('/api/logout', { method: 'POST', cookie })).status, 200);
  assert.equal((await request('/api/workspace', { cookie })).status, 401);
});

test('members are scoped to owned projects and admins can work across projects', async t => {
  const request = await serve(t);
  const member = await signIn(request, 'member');
  const admin = await signIn(request, 'admin');
  const memberData = (await request('/api/workspace', { cookie: member })).data;
  const adminData = (await request('/api/workspace', { cookie: admin })).data;
  assert.deepEqual(memberData.projects.map(project => project.id), [1]);
  assert.deepEqual(memberData.tasks.map(task => task.id), [1, 2, 3]);
  assert.deepEqual(adminData.projects.map(project => project.id), [1, 2]);
  assert.deepEqual(adminData.tasks.map(task => task.id), [1, 2, 3, 4]);
  assert.equal((await request('/api/tasks', {
    method: 'POST', cookie: member, body: { projectId: 2, title: 'Private project task' }
  })).status, 404);
  assert.equal((await request('/api/tasks/4', {
    method: 'PATCH', cookie: member, body: { projectId: 1, status: 'Done' }
  })).status, 404);
  assert.equal((await request('/api/tasks/1', {
    method: 'PATCH', cookie: admin, body: { status: 'Done' }
  })).data.task.status, 'Done');
});

test('validates mutations and persists project creation, task editing, and status changes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'relay-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { dataFile: join(directory, 'data.json') };
  const request = await serve(t, options);
  const cookie = await signIn(request, 'member');
  const post = (path, body) => request('/api/' + path, { method: 'POST', cookie, body });
  assert.equal((await post('projects', { name: '   ' })).status, 422);
  assert.equal((await post('projects', { name: 'x'.repeat(81) })).status, 422);
  const created = await post('projects', { name: ' Sprint planning ' });
  assert.equal(created.status, 201);
  assert.deepEqual(created.data.project, { id: 3, name: 'Sprint planning', description: '', ownerId: 2 });
  const projectId = created.data.project.id;
  assert.equal((await post('tasks', { projectId, title: '' })).status, 422);
  assert.equal((await post('tasks', { projectId, title: 'Set milestones', status: 'Unknown' })).status, 422);
  const added = await post('tasks', { projectId, title: 'Set milestones' });
  assert.equal(added.status, 201);
  assert.equal(added.data.task.id, 5);
  assert.equal(added.data.task.status, 'To do');
  const patch = body => request('/api/tasks/5', { method: 'PATCH', cookie, body });
  assert.equal((await patch({ description: null })).status, 422);
  assert.equal((await patch({ title: 'Confirm milestones', description: 'Review with the team.' })).status, 200);
  assert.equal((await patch({ status: 'Done' })).data.task.status, 'Done');
  const freshServer = await serve(t, options);
  const freshCookie = await signIn(freshServer, 'member');
  const { data } = await freshServer('/api/workspace', { cookie: freshCookie });
  assert.deepEqual(data.projects.at(-1), created.data.project);
  assert.deepEqual(data.tasks.at(-1), {
    id: 5, projectId, title: 'Confirm milestones', description: 'Review with the team.', status: 'Done'
  });
});
