const STORAGE_KEY = 'todo-beta-tasks';
const THEME_KEY = 'todo-beta-theme';

const sampleTasks = [
  {
    id: crypto.randomUUID(),
    title: 'Revisar o modelo do painel',
    nextAction: 'Validar os campos e o fluxo dos cards',
    status: 'Em andamento',
    priority: 'Alta',
    schedule: '',
    deadline: '',
    link: '',
    dependency: '',
    tags: ['produto', 'organização'],
    color: 'blue',
    contacts: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null
  },
  {
    id: crypto.randomUUID(),
    title: 'Retornar uma mensagem importante',
    nextAction: 'Fazer o contato e registrar o retorno',
    status: 'Aguardando',
    priority: 'Média',
    schedule: '',
    deadline: '',
    link: '',
    dependency: 'Aguardando resposta',
    tags: ['pessoal'],
    color: 'sand',
    contacts: [{ name: 'Interlocutor', email: '', phone: '', whatsapp: '' }],
    createdAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
    completedAt: null
  }
];

const state = {
  tasks: loadTasks(),
  editingId: null,
  showCompleted: false,
  sort: 'manual'
};

const el = id => document.getElementById(id);
const overviewView = el('overview-view');
const taskView = el('task-view');
const grid = el('task-grid');
const form = el('task-form');

function loadTasks() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : sampleTasks;
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function init() {
  setTheme(localStorage.getItem(THEME_KEY) || 'light');
  bindEvents();
  renderTasks();
  lucide.createIcons({ attrs: { width: 17, height: 17, 'stroke-width': 1.8 } });
}

function bindEvents() {
  el('theme-toggle').addEventListener('click', toggleTheme);
  el('new-task').addEventListener('click', () => openTask());
  el('home-button').addEventListener('click', showOverview);
  el('back-button').addEventListener('click', showOverview);
  el('search-toggle').addEventListener('click', toggleSearch);
  el('search-input').addEventListener('input', renderTasks);
  el('filter-toggle').addEventListener('click', () => toggleMenu('filter-menu', 'filter-toggle'));
  el('sort-toggle').addEventListener('click', () => toggleMenu('sort-menu', 'sort-toggle'));
  el('filter-status').addEventListener('change', renderTasks);
  el('filter-priority').addEventListener('change', renderTasks);
  el('filter-text').addEventListener('input', renderTasks);
  el('clear-filters').addEventListener('click', clearFilters);
  el('completed-toggle').addEventListener('click', toggleCompleted);
  document.querySelectorAll('input[name="sort"]').forEach(input => input.addEventListener('change', event => {
    state.sort = event.target.value;
    renderTasks();
    closeMenus();
  }));

  el('save-task').addEventListener('click', saveTaskFromForm);
  el('complete-task').addEventListener('click', completeCurrentTask);
  el('delete-task').addEventListener('click', deleteCurrentTask);
  el('add-contact').addEventListener('click', () => addContactEditor());
  el('task-link').addEventListener('input', updateLinkButton);
  el('open-link').addEventListener('click', openTaskLink);
  form.addEventListener('input', () => { el('save-state').textContent = 'Alterações não salvas'; });

  document.addEventListener('click', event => {
    if (!event.target.closest('.menu-wrap')) closeMenus();
  });
}

function renderTasks() {
  const query = normalize(el('search-input').value);
  const status = el('filter-status').value;
  const priority = el('filter-priority').value;
  const extra = normalize(el('filter-text').value);

  let tasks = state.tasks.filter(task => Boolean(task.completedAt) === state.showCompleted);
  tasks = tasks.filter(task => {
    const searchable = normalize([
      task.title,
      task.nextAction,
      task.dependency,
      ...task.tags,
      ...task.contacts.map(contact => contact.name)
    ].join(' '));
    return (!query || searchable.includes(query)) &&
      (!status || task.status === status) &&
      (!priority || task.priority === priority) &&
      (!extra || searchable.includes(extra));
  });

  tasks = sortTasks(tasks);
  grid.replaceChildren(...tasks.map(taskCard));
  el('empty-state').hidden = tasks.length > 0;
  el('task-count').textContent = `${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'}`;
  el('list-title').textContent = state.showCompleted ? 'Tarefas concluídas' : 'Tarefas ativas';
  el('completed-count').textContent = state.tasks.filter(task => task.completedAt).length;
  lucide.createIcons({ attrs: { width: 17, height: 17, 'stroke-width': 1.8 } });
  enableDragAndDrop();
}

function sortTasks(tasks) {
  const copy = [...tasks];
  if (state.sort === 'priority') {
    const rank = { Alta: 3, Média: 2, Baixa: 1 };
    return copy.sort((a, b) => rank[b.priority] - rank[a.priority]);
  }
  if (state.sort === 'schedule') {
    return copy.sort((a, b) => dateValue(a.schedule || a.deadline) - dateValue(b.schedule || b.deadline));
  }
  if (state.sort === 'updated') return copy.sort((a, b) => b.updatedAt - a.updatedAt);
  return copy;
}

function taskCard(task) {
  const card = document.createElement('article');
  card.className = 'task-card';
  card.dataset.id = task.id;
  card.dataset.color = task.color || 'neutral';
  card.draggable = state.sort === 'manual' && !state.showCompleted;

  const schedule = task.schedule || task.deadline;
  const contacts = task.contacts.filter(contact => contact.name).map(contact => contact.name).join(' · ');
  const meta = [
    contacts ? `<button class="meta-button" type="button" data-filter-contact="${escapeHtml(contacts.split(' · ')[0])}"><i data-lucide="user-round"></i>${escapeHtml(contacts)}</button>` : '',
    task.dependency ? `<span><i data-lucide="pause-circle"></i>${escapeHtml(task.dependency)}</span>` : '',
    task.link ? `<span><i data-lucide="link"></i>Link associado</span>` : '',
    task.tags.length ? `<span><i data-lucide="tags"></i>${escapeHtml(task.tags.join(' · '))}</span>` : ''
  ].filter(Boolean).join('');

  card.innerHTML = `
    <div class="card-top">
      <button class="drag-handle" type="button" aria-label="Arrastar tarefa"><i data-lucide="grip-vertical"></i></button>
      <span class="priority">${escapeHtml(task.priority)}</span>
      <span class="status">${escapeHtml(task.status)}</span>
    </div>
    <button class="card-main" type="button">
      <strong>${escapeHtml(task.title)}</strong>
      ${task.nextAction ? `<span class="next-action"><i data-lucide="corner-down-right"></i>${escapeHtml(task.nextAction)}</span>` : ''}
    </button>
    ${meta ? `<div class="card-meta">${meta}</div>` : ''}
    <div class="card-bottom">
      <span>${schedule ? `<i data-lucide="calendar-clock"></i>${formatDate(schedule)}` : 'Sem agendamento'}</span>
      <button class="complete-button" type="button" aria-label="${task.completedAt ? 'Reabrir' : 'Concluir'} tarefa" data-tooltip="${task.completedAt ? 'Reabrir' : 'Concluir'}"><i data-lucide="${task.completedAt ? 'rotate-ccw' : 'circle-check'}"></i></button>
    </div>`;

  card.querySelector('.card-main').addEventListener('click', () => openTask(task.id));
  card.querySelector('.complete-button').addEventListener('click', () => toggleTaskComplete(task.id));
  card.querySelector('[data-filter-contact]')?.addEventListener('click', event => {
    el('filter-text').value = event.currentTarget.dataset.filterContact;
    state.showCompleted = false;
    syncCompletedButton();
    renderTasks();
  });
  return card;
}

function openTask(id = null) {
  state.editingId = id;
  const task = id ? state.tasks.find(item => item.id === id) : emptyTask();
  fillForm(task);
  el('ai-create').hidden = Boolean(id);
  el('delete-task').hidden = !id;
  el('complete-task').hidden = !id;
  overviewView.hidden = true;
  taskView.hidden = false;
  el('task-title').focus();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function showOverview() {
  taskView.hidden = true;
  overviewView.hidden = false;
  el('save-state').textContent = '';
  renderTasks();
}

function emptyTask() {
  return {
    id: '', title: '', nextAction: '', status: 'Fazer', priority: 'Média', schedule: '', deadline: '',
    link: '', dependency: '', tags: [], color: 'neutral', contacts: [], createdAt: Date.now(), updatedAt: Date.now(), completedAt: null
  };
}

function fillForm(task) {
  el('task-id').value = task.id;
  el('task-title').value = task.title;
  el('task-next-action').value = task.nextAction;
  el('task-status').value = task.status;
  el('task-priority').value = task.priority;
  el('task-schedule').value = task.schedule;
  el('task-deadline').value = task.deadline;
  el('task-link').value = task.link;
  el('task-dependency').value = task.dependency;
  el('task-tags').value = task.tags.join(', ');
  form.querySelector(`input[name="color"][value="${task.color || 'neutral'}"]`).checked = true;
  el('contacts-list').replaceChildren();
  task.contacts.forEach(addContactEditor);
  updateLinkButton();
}

function saveTaskFromForm() {
  if (!form.reportValidity()) return;
  const existing = state.tasks.find(task => task.id === state.editingId);
  const task = {
    id: state.editingId || crypto.randomUUID(),
    title: el('task-title').value.trim(),
    nextAction: el('task-next-action').value.trim(),
    status: el('task-status').value,
    priority: el('task-priority').value,
    schedule: el('task-schedule').value,
    deadline: el('task-deadline').value,
    link: el('task-link').value.trim(),
    dependency: el('task-dependency').value.trim(),
    tags: el('task-tags').value.split(',').map(item => item.trim()).filter(Boolean),
    color: form.querySelector('input[name="color"]:checked').value,
    contacts: readContacts(),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
    completedAt: el('task-status').value === 'Concluído' ? (existing?.completedAt || Date.now()) : null
  };

  if (existing) Object.assign(existing, task);
  else state.tasks.unshift(task);
  saveTasks();
  state.editingId = task.id;
  el('save-state').textContent = 'Salvo agora';
  setTimeout(showOverview, 250);
}

function completeCurrentTask() {
  if (!state.editingId) return;
  toggleTaskComplete(state.editingId);
  showOverview();
}

function toggleTaskComplete(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return;
  if (task.completedAt) {
    task.completedAt = null;
    task.status = 'Fazer';
  } else {
    task.completedAt = Date.now();
    task.status = 'Concluído';
  }
  task.updatedAt = Date.now();
  saveTasks();
  renderTasks();
}

function deleteCurrentTask() {
  if (!state.editingId || !confirm('Excluir esta tarefa?')) return;
  state.tasks = state.tasks.filter(task => task.id !== state.editingId);
  saveTasks();
  showOverview();
}

function addContactEditor(contact = { name: '', email: '', phone: '', whatsapp: '' }) {
  const fragment = el('contact-template').content.cloneNode(true);
  const editor = fragment.querySelector('.contact-editor');
  Object.entries(contact).forEach(([key, value]) => {
    const input = editor.querySelector(`[data-contact="${key}"]`);
    if (input) input.value = value;
  });
  editor.querySelector('.remove-contact').addEventListener('click', () => editor.remove());
  el('contacts-list').append(fragment);
  lucide.createIcons({ attrs: { width: 17, height: 17, 'stroke-width': 1.8 } });
}

function readContacts() {
  return [...el('contacts-list').querySelectorAll('.contact-editor')].map(editor => ({
    name: editor.querySelector('[data-contact="name"]').value.trim(),
    email: editor.querySelector('[data-contact="email"]').value.trim(),
    phone: editor.querySelector('[data-contact="phone"]').value.trim(),
    whatsapp: editor.querySelector('[data-contact="whatsapp"]').value.trim()
  })).filter(contact => Object.values(contact).some(Boolean));
}

function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  const button = el('theme-toggle');
  if (!button) return;
  button.innerHTML = `<i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>`;
  lucide.createIcons({ attrs: { width: 17, height: 17, 'stroke-width': 1.8 } });
}

function toggleSearch() {
  const control = el('search-control');
  const open = !control.classList.contains('is-open');
  control.classList.toggle('is-open', open);
  if (open) el('search-input').focus();
}

function toggleMenu(menuId, buttonId) {
  const menu = el(menuId);
  const willOpen = menu.hidden;
  closeMenus();
  menu.hidden = !willOpen;
  el(buttonId).setAttribute('aria-expanded', String(willOpen));
}

function closeMenus() {
  ['filter-menu', 'sort-menu'].forEach(id => { el(id).hidden = true; });
  ['filter-toggle', 'sort-toggle'].forEach(id => { el(id).setAttribute('aria-expanded', 'false'); });
}

function clearFilters() {
  el('filter-status').value = '';
  el('filter-priority').value = '';
  el('filter-text').value = '';
  renderTasks();
  closeMenus();
}

function toggleCompleted() {
  state.showCompleted = !state.showCompleted;
  syncCompletedButton();
  renderTasks();
}

function syncCompletedButton() {
  el('completed-toggle').setAttribute('aria-pressed', String(state.showCompleted));
}

function updateLinkButton() {
  el('open-link').disabled = !el('task-link').value.trim();
}

function openTaskLink() {
  const link = el('task-link').value.trim();
  if (link) window.open(link, '_blank', 'noopener,noreferrer');
}

function enableDragAndDrop() {
  if (state.sort !== 'manual' || state.showCompleted) return;
  grid.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('dragstart', () => card.classList.add('is-dragging'));
    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      const visibleIds = [...grid.querySelectorAll('.task-card')].map(item => item.dataset.id);
      const visibleSet = new Set(visibleIds);
      const reordered = visibleIds.map(id => state.tasks.find(task => task.id === id));
      const hidden = state.tasks.filter(task => !visibleSet.has(task.id));
      state.tasks = [...reordered, ...hidden];
      saveTasks();
    });
  });

  grid.addEventListener('dragover', event => {
    event.preventDefault();
    const dragging = grid.querySelector('.is-dragging');
    if (!dragging) return;
    const target = [...grid.querySelectorAll('.task-card:not(.is-dragging)')].find(card => {
      const rect = card.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    if (target) grid.insertBefore(dragging, target);
    else grid.append(dragging);
  });
}

function dateValue(value) {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function formatDate(value) {
  const withTime = value.includes('T');
  const date = new Date(withTime ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(date).replace('.', '');
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

init();
