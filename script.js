/* Daily Command — Local Auth + Dynamic Task Scheduler
 * All data persisted in localStorage.
 * Storage keys:
 *   dc_users       : { [email]: { name, email, phone, passwordHash, avatar } }
 *   dc_session     : email of logged-in user
 *   dc_tasks_<email> : { [YYYY-MM-DD]: { startTime: "HH:MM", tasks: [{id,time,title,done}] } }
 */

// ============ Utilities ============
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const LS = {
  get(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
       <rect width='100' height='100' fill='#1a1d26'/>
       <circle cx='50' cy='38' r='18' fill='#d4af37'/>
       <path d='M15 92c5-20 25-30 35-30s30 10 35 30' fill='#d4af37'/>
     </svg>`);

async function hashPassword(pw) {
  const data = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function toDateKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fmtTime(t) {
  if (!t) return "--:--";
  const [h,m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = ((h+11)%12)+1;
  return `${hh}:${String(m).padStart(2,'0')} ${ampm}`;
}

// ============ Auth State ============
let currentUser = null;    // { name, email, phone, avatar }
let selectedDateKey = null;

// ============ AUTH UI ============
function initAuthTabs() {
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const which = t.dataset.tab;
    $('#login-form').classList.toggle('hidden', which !== 'login');
    $('#signup-form').classList.toggle('hidden', which !== 'signup');
  }));
}

$('#signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#signup-msg'); msg.className = 'form-msg'; msg.textContent = '';
  const f = e.target;
  const email = f.email.value.trim().toLowerCase();
  const users = LS.get('dc_users', {});
  if (users[email]) { msg.className='form-msg error'; msg.textContent = 'Account already exists. Please log in.'; return; }
  const passwordHash = await hashPassword(f.password.value);
  users[email] = {
    name: f.name.value.trim(),
    email, phone: f.phone.value.trim(),
    passwordHash, avatar: null
  };
  LS.set('dc_users', users);
  LS.set('dc_session', email);
  msg.className = 'form-msg ok'; msg.textContent = 'Account created!';
  setTimeout(loadSession, 400);
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#login-msg'); msg.className='form-msg'; msg.textContent='';
  const f = e.target;
  const email = f.email.value.trim().toLowerCase();
  const users = LS.get('dc_users', {});
  const u = users[email];
  if (!u) { msg.className='form-msg error'; msg.textContent='No account with that email.'; return; }
  const hash = await hashPassword(f.password.value);
  if (hash !== u.passwordHash) { msg.className='form-msg error'; msg.textContent='Incorrect password.'; return; }
  LS.set('dc_session', email);
  loadSession();
});

function loadSession() {
  const email = LS.get('dc_session', null);
  if (!email) { showAuth(); return; }
  const users = LS.get('dc_users', {});
  const u = users[email];
  if (!u) { LS.set('dc_session', null); showAuth(); return; }
  currentUser = u;
  showApp();
}
function showAuth() {
  $('#auth-screen').classList.remove('hidden');
  $('#app').classList.add('hidden');
}
function showApp() {
  $('#auth-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  renderHeader();
  renderDays();
  selectDate(new Date());
}

// ============ Header ============
function renderHeader() {
  $('#header-avatar').src = currentUser.avatar || DEFAULT_AVATAR;
  $('#header-name').textContent = currentUser.name;
}

$('#btn-logout').addEventListener('click', () => {
  LS.set('dc_session', null);
  currentUser = null;
  showAuth();
});

// ============ Day Selector ============
function renderDays() {
  const list = $('#day-list');
  list.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  // Show 7 days starting from today
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = toDateKey(d);
    const btn = document.createElement('button');
    btn.className = 'day-btn';
    btn.dataset.key = key;
    const label = i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : dayNames[d.getDay()]);
    btn.innerHTML = `
      <div>
        <div>${label}</div>
        <div class="date">${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</div>
      </div>
      <div class="dot"></div>`;
    if (getDayData(key)) btn.classList.add('has-tasks');
    btn.addEventListener('click', () => selectDate(d));
    list.appendChild(btn);
  }
}
function markActiveDay() {
  $$('.day-btn').forEach(b => b.classList.toggle('active', b.dataset.key === selectedDateKey));
}

// ============ Task Data ============
function tasksKey() { return `dc_tasks_${currentUser.email}`; }
function getAllTasks() { return LS.get(tasksKey(), {}); }
function getDayData(dateKey) {
  const all = getAllTasks();
  return all[dateKey] || null;
}
function saveDayData(dateKey, data) {
  const all = getAllTasks();
  if (!data || (!data.startTime && (!data.tasks || data.tasks.length === 0))) {
    delete all[dateKey];
  } else {
    all[dateKey] = data;
  }
  LS.set(tasksKey(), all);
}

// ============ Select Date / Render Schedule ============
function selectDate(dateObj) {
  selectedDateKey = toDateKey(dateObj);
  markActiveDay();
  const isToday = selectedDateKey === toDateKey(new Date());
  $('#schedule-title').textContent = isToday ? "Today's Schedule" :
    dateObj.toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric'}) + " — Schedule";
  $('#schedule-sub').textContent = "Plan your day, your way.";
  renderSchedule();
}

function renderSchedule() {
  const data = getDayData(selectedDateKey);
  if (!data || !data.startTime) {
    $('#start-prompt').classList.remove('hidden');
    $('#task-area').classList.add('hidden');
    $('#start-time-input').value = '';
    updateProgress([]);
    return;
  }
  $('#start-prompt').classList.add('hidden');
  $('#task-area').classList.remove('hidden');
  $('#start-shown-time').textContent = fmtTime(data.startTime);
  renderTasks(data.tasks || []);
}

// ============ Start Time ============
$('#set-start-btn').addEventListener('click', () => {
  const t = $('#start-time-input').value;
  if (!t) { alert('Please pick a start time.'); return; }
  const data = getDayData(selectedDateKey) || { tasks: [] };
  data.startTime = t;
  saveDayData(selectedDateKey, data);
  renderDays(); markActiveDay();
  renderSchedule();
});

$('#change-start-btn').addEventListener('click', () => {
  const data = getDayData(selectedDateKey);
  if (!data) return;
  data.startTime = null;
  saveDayData(selectedDateKey, data);
  renderSchedule();
});

// ============ Tasks ============
$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const time = $('#task-time').value;
  const title = $('#task-title').value.trim();
  if (!title) return;
  const data = getDayData(selectedDateKey) || { tasks: [] };
  data.tasks = data.tasks || [];
  data.tasks.push({ id: uid(), time: time || data.startTime, title, done: false });
  data.tasks.sort((a,b) => (a.time||'').localeCompare(b.time||''));
  saveDayData(selectedDateKey, data);
  $('#task-title').value = '';
  $('#task-time').value = '';
  renderDays(); markActiveDay();
  renderTasks(data.tasks);
});

function renderTasks(tasks) {
  const ul = $('#task-list');
  ul.innerHTML = '';
  $('#empty-msg').classList.toggle('hidden', tasks.length > 0);
  tasks.forEach(t => {
    const li = document.createElement('li');
    li.className = 'task-item' + (t.done ? ' done' : '');
    li.innerHTML = `
      <button class="task-check ${t.done?'checked':''}" aria-label="Toggle task"></button>
      <span class="task-time-lbl">${fmtTime(t.time)}</span>
      <span class="task-title"></span>
      <button class="task-del" aria-label="Delete">×</button>`;
    li.querySelector('.task-title').textContent = t.title;
    li.querySelector('.task-check').addEventListener('click', () => toggleTask(t.id));
    li.querySelector('.task-del').addEventListener('click', () => deleteTask(t.id));
    ul.appendChild(li);
  });
  updateProgress(tasks);
}

function toggleTask(id) {
  const data = getDayData(selectedDateKey);
  if (!data) return;
  const t = data.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveDayData(selectedDateKey, data);
  renderTasks(data.tasks);
}
function deleteTask(id) {
  const data = getDayData(selectedDateKey);
  if (!data) return;
  data.tasks = data.tasks.filter(x => x.id !== id);
  saveDayData(selectedDateKey, data);
  renderDays(); markActiveDay();
  renderTasks(data.tasks);
}

function updateProgress(tasks) {
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  $('#progress-count').textContent = `${done}/${total}`;
  const pct = total === 0 ? 0 : (done / total) * 100;
  $('#progress-fill').style.width = pct + '%';
}

// ============ Settings ============
$('#btn-settings').addEventListener('click', openSettings);
$('#close-settings').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
$('#settings-modal').addEventListener('click', (e) => {
  if (e.target.id === 'settings-modal') $('#settings-modal').classList.add('hidden');
});

function openSettings() {
  $('#settings-avatar').src = currentUser.avatar || DEFAULT_AVATAR;
  $('#s-name').value = currentUser.name;
  $('#s-phone').value = currentUser.phone;
  $('#s-email').value = currentUser.email;
  $('#profile-msg').textContent = '';
  $('#pass-msg').textContent = '';
  $('#curr-pass').value = '';
  $('#new-pass').value = '';
  $('#settings-modal').classList.remove('hidden');
}

$('#avatar-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    const users = LS.get('dc_users', {});
    users[currentUser.email].avatar = dataUrl;
    currentUser.avatar = dataUrl;
    LS.set('dc_users', users);
    $('#settings-avatar').src = dataUrl;
    renderHeader();
  };
  reader.readAsDataURL(file);
});

$('#profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = $('#profile-msg');
  const users = LS.get('dc_users', {});
  users[currentUser.email].name = $('#s-name').value.trim();
  users[currentUser.email].phone = $('#s-phone').value.trim();
  currentUser = users[currentUser.email];
  LS.set('dc_users', users);
  msg.className = 'form-msg ok'; msg.textContent = 'Profile updated!';
  renderHeader();
});

$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#pass-msg'); msg.className='form-msg';
  const users = LS.get('dc_users', {});
  const curr = await hashPassword($('#curr-pass').value);
  if (curr !== users[currentUser.email].passwordHash) {
    msg.className='form-msg error'; msg.textContent='Current password is incorrect.'; return;
  }
  users[currentUser.email].passwordHash = await hashPassword($('#new-pass').value);
  LS.set('dc_users', users);
  $('#curr-pass').value=''; $('#new-pass').value='';
  msg.className='form-msg ok'; msg.textContent='Password updated!';
});

// ============ Boot ============
initAuthTabs();
loadSession();
