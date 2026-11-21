const $ = selector => document.querySelector(selector);
const loginForm = $('#login-form');
const editForm = $('#editor-form');
const dialog = $('#editor');
const search = $('#search');
const filter = $('#filter');
let workspace;
let projectId;
let editor;
let epoch = 0;

async function api(path, method = 'GET', body) {
  const response = await fetch('/api/' + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') showLogin();
    throw new Error(data.error);
  }
  return data;
}

function showLogin() {
  epoch++;
  workspace = undefined;
  projectId = undefined;
  search.value = '';
  filter.value = '';
  if (dialog.open) dialog.close();
  $('#workspace').hidden = true;
  $('#identity').hidden = true;
  $('#login').hidden = false;
}

function make(tag, text, className) {
  const item = document.createElement(tag);
  item.textContent = text;
  if (className) item.className = className;
  return item;
}

function renderTasks() {
  if (!workspace) return;
  const query = search.value.trim().toLowerCase();
  const tasks = workspace.tasks.filter(task =>
    task.projectId === projectId &&
    (!filter.value || task.status === filter.value) &&
    (task.title.toLowerCase().includes(query) || task.description.toLowerCase().includes(query))
  );
  $('#task-count').textContent = tasks.length + (tasks.length === 1 ? ' task' : ' tasks');
  const empty = $('#empty');
  empty.hidden = tasks.length > 0;
  empty.textContent = query || filter.value ? 'No tasks match your filters.' : 'No tasks yet. Create a task to get started.';
  $('#tasks').replaceChildren(...tasks.map(task => {
    const row = make('li', '', 'task-row');
    row.dataset.testid = 'task-row';
    const details = make('div', '', 'task-details');
    const title = make('button', task.title, 'task-title');
    title.dataset.testid = 'task-title';
    title.type = 'button';
    title.setAttribute('aria-label', 'Edit ' + task.title);
    title.addEventListener('click', () => openEditor('task', task));
    details.append(title);
    if (task.description) details.append(make('p', task.description));
    const status = make('select', '', 'status');
    status.dataset.testid = 'task-status';
    status.dataset.status = task.status;
    status.setAttribute('aria-label', 'Status for ' + task.title);
    status.append(...workspace.statuses.map(value => new Option(value)));
    status.value = task.status;
    status.addEventListener('change', async () => {
      const currentEpoch = epoch;
      status.disabled = true;
      try {
        const result = await api('tasks/' + task.id, 'PATCH', { status: status.value });
        if (currentEpoch !== epoch) return;
        task.status = result.task.status;
        renderTasks();
        if (status.isConnected === false) {
          [...$('#tasks').querySelectorAll('select')].find(item => item.dataset.task === String(task.id))?.focus();
        }
        $('#notice').textContent = 'Task status updated.';
      } catch (error) {
        status.value = task.status;
        $('#notice').textContent = error.message;
      } finally {
        status.disabled = false;
      }
    });
    status.dataset.task = task.id;
    row.append(details, status);
    return row;
  }));
}

function render() {
  const project = workspace.projects.find(item => item.id === projectId);
  $('#projects').replaceChildren(...workspace.projects.map(item => {
    const button = make('button', item.name, 'project');
    button.dataset.testid = 'project-item';
    if (item.id === projectId) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => {
      projectId = item.id;
      search.value = '';
      filter.value = '';
      render();
      $('#projects [aria-current]').focus();
    });
    return button;
  }));
  $('#project-title').textContent = project?.name ?? 'Create your first project';
  $('#project-description').textContent = project?.description ?? '';
  $('#new-task').hidden = !project;
  $('#tasks-panel').hidden = !project;
  renderTasks();
}

async function loadWorkspace() {
  const currentEpoch = epoch;
  const result = await api('workspace');
  if (epoch !== currentEpoch) return;
  workspace = result;
  projectId ??= workspace.projects[0]?.id;
  filter.replaceChildren(new Option('All statuses', ''), ...workspace.statuses.map(value => new Option(value)));
  $('#user').textContent = workspace.user.name + ' · ' + (workspace.user.role === 'admin' ? 'Admin' : 'Member');
  $('#login').hidden = true;
  $('#identity').hidden = false;
  $('#workspace').hidden = false;
  render();
}

function openEditor(kind, task) {
  editor = { kind, task, projectId };
  editForm.reset();
  editForm.querySelector('.error').textContent = '';
  $('#editor-title').textContent = task ? 'Edit task' : kind === 'task' ? 'New task' : 'New project';
  $('#name-label').textContent = kind === 'task' ? 'Task title' : 'Project name';
  editForm.elements.title.maxLength = kind === 'task' ? 100 : 80;
  editForm.elements.title.value = task?.title ?? '';
  editForm.elements.description.value = task?.description ?? '';
  $('#status-field').hidden = kind !== 'task';
  editForm.elements.status.replaceChildren(...workspace.statuses.map(value => new Option(value)));
  editForm.elements.status.value = task?.status ?? workspace.statuses[0];
  dialog.showModal();
  editForm.elements.title.focus();
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = loginForm.querySelector('button');
  const errorBox = loginForm.querySelector('.error');
  errorBox.textContent = '';
  submit.disabled = true;
  try {
    await api('login', 'POST', Object.fromEntries(new FormData(loginForm)));
    await loadWorkspace();
    loginForm.reset();
    $('#notice').textContent = '';
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.querySelectorAll('.demo-account').forEach(button => {
  button.addEventListener('click', () => {
    loginForm.elements.email.value = button.dataset.email;
    loginForm.elements.password.value = 'relay-demo';
    loginForm.querySelector('button').focus();
  });
});

$('#logout').addEventListener('click', async () => {
  try {
    await api('logout', 'POST');
    showLogin();
    $('#notice').textContent = 'Signed out.';
    loginForm.elements.email.focus();
  } catch (error) {
    $('#notice').textContent = error.message;
  }
});

$('#new-project').addEventListener('click', () => openEditor('project'));
$('#new-task').addEventListener('click', () => openEditor('task'));
$('#cancel').addEventListener('click', () => dialog.close());
search.addEventListener('input', renderTasks);
filter.addEventListener('change', renderTasks);

editForm.addEventListener('submit', async event => {
  event.preventDefault();
  const { kind, task, projectId: destination } = editor;
  const { title, description, status } = Object.fromEntries(new FormData(editForm));
  const errorBox = editForm.querySelector('.error');
  const saveButton = $('#save');
  const currentEpoch = epoch;
  errorBox.textContent = '';
  saveButton.disabled = true;
  $('#cancel').disabled = true;
  try {
    if (kind === 'project') {
      const result = await api('projects', 'POST', { name: title, description });
      if (currentEpoch !== epoch) return;
      workspace.projects.push(result.project);
      projectId = result.project.id;
      search.value = '';
      filter.value = '';
    } else {
      const result = await api(task ? 'tasks/' + task.id : 'tasks', task ? 'PATCH' : 'POST',
        { title, description, status, projectId: destination });
      if (currentEpoch !== epoch) return;
      if (task) Object.assign(task, result.task);
      else workspace.tasks.push(result.task);
    }
    dialog.close();
    render();
    $('#notice').textContent = kind === 'project' ? 'Project created.' : task ? 'Task saved.' : 'Task created.';
  } catch (error) {
    if (dialog.open) errorBox.textContent = error.message;
    else $('#notice').textContent = error.message;
  } finally {
    saveButton.disabled = false;
    $('#cancel').disabled = false;
  }
});
dialog.addEventListener('cancel', event => {
  if ($('#save').disabled) event.preventDefault();
});

loadWorkspace().catch(error => {
  if ($('#login').hidden) {
    showLogin();
    $('#notice').textContent = error.message;
  }
});
