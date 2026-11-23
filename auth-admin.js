// auth-admin.js (v4) — Mandatory Login Gate, Self-Service User Signup + Admin Approval & Ward Mapping
(function () {
  'use strict';

  const ADMIN_USERNAME = 'veerusgithub';
  const AUTH_STORE_KEY = 'dronadula_auth_v1';
  const SESSION_KEY = 'dronadula_session_v1';
  const DEFAULT_FIREBASE_RTDB = 'https://voter-list-17964-default-rtdb.firebaseio.com';
  const DEFAULT_FIREBASE_ROOM = 'dronadula_main';

  let authStore = { adminHash: '', users: {}, pendingUsers: {} };
  let currentSession = null;

  window.getCurrentAuthSession = function () { return currentSession; };

  function getAuthFbBase() {
    const u = (typeof fbConfig !== 'undefined' && fbConfig.url) ? fbConfig.url : DEFAULT_FIREBASE_RTDB;
    const r = (typeof fbConfig !== 'undefined' && fbConfig.room) ? fbConfig.room : DEFAULT_FIREBASE_ROOM;
    return `${String(u).trim().replace(/\/+$/, '')}/rooms/${encodeURIComponent(r)}/auth`;
  }

  async function hashPin(pin) {
    const data = new TextEncoder().encode('dronadula::' + String(pin || '').trim());
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 2166136261;
    for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 16777619); }
    return 'fnv_' + (h >>> 0).toString(16);
  }

  function loadAuthLocal() {
    try {
      const raw = localStorage.getItem(AUTH_STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        authStore = { adminHash: p.adminHash || '', users: p.users || {}, pendingUsers: p.pendingUsers || {} };
      }
    } catch (e) {}
    try {
      const s = localStorage.getItem(SESSION_KEY);
      if (s) currentSession = JSON.parse(s);
    } catch (e) {}
  }

  function saveAuthLocal() {
    try { localStorage.setItem(AUTH_STORE_KEY, JSON.stringify(authStore)); } catch (e) {}
  }

  function saveSession(sess) {
    currentSession = sess;
    try {
      if (sess) localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  window._mergeRemoteAuth = function (remoteAuth) {
    if (!remoteAuth || typeof remoteAuth !== 'object') return;
    if (remoteAuth.adminHash) authStore.adminHash = remoteAuth.adminHash;
    if (remoteAuth.users && typeof remoteAuth.users === 'object') authStore.users = { ...authStore.users, ...remoteAuth.users };
    if (remoteAuth.pendingUsers && typeof remoteAuth.pendingUsers === 'object') authStore.pendingUsers = remoteAuth.pendingUsers;
    saveAuthLocal();
    updateAdminPendingBadge();
  };

  async function pullAuthFromFirebase() {
    try {
      const res = await fetch(`${getAuthFbBase()}.json`);
      if (res.ok) {
        const data = await res.json();
        if (data) window._mergeRemoteAuth(data);
      }
    } catch (e) {}
  }

  async function syncAuthToFirebase() {
    try {
      await fetch(`${getAuthFbBase()}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authStore)
      });
    } catch (e) {}
  }

  async function submitPendingSignupToFirebase(uid, record) {
    authStore.pendingUsers[uid] = record;
    saveAuthLocal();
    try {
      await fetch(`${getAuthFbBase()}/pendingUsers/${encodeURIComponent(uid)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
    } catch (e) {}
  }

  function updateAdminPendingBadge() {
    const btn = document.getElementById('admin-panel-btn');
    if (!btn) return;
    const cnt = Object.keys(authStore.pendingUsers || {}).length;
    btn.textContent = cnt > 0 ? `Admin (${cnt})` : 'Admin';
  }

  function injectUI() {
    const langBtn = document.getElementById('lang-toggle');
    if (langBtn && !document.getElementById('admin-panel-btn')) {
      langBtn.insertAdjacentHTML('beforebegin',
        `<button id="admin-panel-btn" type="button" class="hidden px-2 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-bold transition">Admin</button>`);
    }
    const addBtn = document.getElementById('add-btn');
    if (addBtn && !document.getElementById('logout-btn')) {
      addBtn.insertAdjacentHTML('afterend',
        `<button id="logout-btn" type="button" title="Logout" class="hidden px-2 py-1.5 rounded-lg bg-white/15 hover:bg-rose-500 text-white text-xs font-bold transition">Exit</button>`);
    }

    const wardOpts = Array.from({ length: 14 }, (_, i) => `<option value="ward:${i + 1}">Ward ${i + 1}</option>`).join('');

    if (!document.getElementById('auth-gate')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="auth-gate" class="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div class="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 my-auto">
            <div class="bg-indigo-700 text-white p-5 text-center">
              <h2 class="text-lg font-extrabold leading-tight">ద్రోణాదుల పంచాయతీ ఓటర్లు</h2>
              <p class="text-xs text-indigo-100 mt-0.5">104-Parchur · 14 Wards · 5,655 Voters</p>
            </div>
            <div class="p-5 space-y-4">
              <div class="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl text-[11px]">
                <button id="tab-login-member" type="button" class="py-2 rounded-lg font-bold bg-white text-indigo-700 shadow-xs">Sign In</button>
                <button id="tab-signup-member" type="button" class="py-2 rounded-lg font-bold text-slate-600">Sign Up</button>
                <button id="tab-login-admin" type="button" class="py-2 rounded-lg font-bold text-slate-600">Admin</button>
              </div>
              <form id="auth-form" class="space-y-3">
                <div id="signup-extra-fields" class="hidden space-y-2.5">
                  <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                    <input id="auth-fullname" type="text" placeholder="Your full name" class="w-full px-3 py-2 text-sm rounded-xl border border-slate-300" />
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                    <input id="auth-phone" type="tel" placeholder="10-digit mobile number" class="w-full px-3 py-2 text-sm rounded-xl border border-slate-300" />
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-slate-700 mb-1">Contestant Ward</label>
                    <select id="auth-req-scope" class="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white font-semibold">${wardOpts}</select>
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1" for="auth-username">Username</label>
                  <input id="auth-username" type="text" autocomplete="username" required placeholder="Enter username"
                    class="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1" for="auth-pin">PIN / Passcode</label>
                  <input id="auth-pin" type="password" autocomplete="current-password" required minlength="4" placeholder="Min 4 characters"
                    class="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <p id="auth-hint" class="text-[11px] text-slate-500 leading-snug"></p>
                <p id="auth-msg" class="hidden text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"></p>
                <p id="auth-error" class="hidden text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"></p>
                <button id="auth-submit-btn" type="submit" class="w-full py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold shadow-sm transition">Sign In</button>
              </form>
            </div>
          </div>
        </div>

        <div id="admin-modal" class="hidden fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
            <div class="px-4 py-3.5 bg-indigo-700 text-white flex items-center justify-between">
              <div>
                <h3 class="text-sm font-extrabold">Admin Panel · ${ADMIN_USERNAME}</h3>
                <p class="text-[11px] text-indigo-100">Approve signups, map wards &amp; backup database</p>
              </div>
              <button id="close-admin-modal" type="button" class="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold">Close</button>
            </div>
            <div class="p-4 overflow-y-auto space-y-4">
              <div class="space-y-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-amber-800">Pending Sign-Up Requests</h4>
                <div id="admin-pending-list" class="space-y-2"></div>
              </div>
              <form id="add-user-form" class="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-slate-700">Add / Update Team Member</h4>
                <div class="grid grid-cols-2 gap-2">
                  <input id="new-user-name" type="text" required placeholder="Full Name" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                  <input id="new-user-id" type="text" required placeholder="Username (e.g. ward8)" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <input id="new-user-pin" type="password" required minlength="4" placeholder="PIN (min 4 chars)" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                  <select id="new-user-scope" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-semibold">
                    ${wardOpts}
                    <option value="east">East (Wards 1–7)</option>
                    <option value="west">West (Wards 8–14)</option>
                    <option value="all">All Wards (1–14)</option>
                  </select>
                </div>
                <button type="submit" class="w-full py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold">Save Team Member</button>
              </form>
              <div class="space-y-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-slate-600">Approved Team Members</h4>
                <div id="admin-users-list" class="space-y-1.5"></div>
              </div>
              <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-emerald-900">Firebase Database Backup</h4>
                <p class="text-[11px] text-emerald-800">Upload all 5,655 base voter records and push all local campaign statuses into Firebase.</p>
                <button id="seed-voters-fb-btn" type="button" class="w-full py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold">Upload All 5,655 Voters + Status to Firebase</button>
                <p id="seed-voters-status" class="text-[11px] font-semibold text-emerald-800 hidden"></p>
              </div>
              <form id="change-admin-pin-form" class="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-amber-900">Update Admin PIN (${ADMIN_USERNAME})</h4>
                <div class="flex gap-2">
                  <input id="new-admin-pin" type="password" required minlength="4" placeholder="New Admin PIN" class="flex-1 px-3 py-2 text-xs rounded-xl border border-amber-300 bg-white" />
                  <button type="submit" class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold">Update</button>
                </div>
              </form>
            </div>
          </div>
        </div>`);
    }
  }

  function renderAdminLists() {
    updateAdminPendingBadge();
    const pendEl = document.getElementById('admin-pending-list');
    const pendEntries = Object.entries(authStore.pendingUsers || {});
    if (pendEl) {
      if (!pendEntries.length) {
        pendEl.innerHTML = '<div class="text-xs text-slate-500 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">No pending sign-up requests.</div>';
      } else {
        const wOpts = (sel) => Array.from({ length: 14 }, (_, i) => {
          const val = `ward:${i + 1}`;
          return `<option value="${val}" ${sel === val ? 'selected' : ''}>Ward ${i + 1}</option>`;
        }).join('') + `<option value="east" ${sel === 'east' ? 'selected' : ''}>East (1–7)</option><option value="west" ${sel === 'west' ? 'selected' : ''}>West (8–14)</option><option value="all" ${sel === 'all' ? 'selected' : ''}>All Wards</option>`;

        pendEl.innerHTML = pendEntries.map(([uid, u]) => `
          <div class="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
            <div class="flex items-center justify-between">
              <div><b>${u.name || uid}</b> <span class="font-mono text-slate-500">(@${uid})</span>${u.phone ? ` · ${u.phone}` : ''}</div>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">Pending</span>
            </div>
            <div class="flex items-center gap-1.5">
              <select data-approve-scope="${uid}" class="flex-1 px-2 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold">${wOpts(u.requestedScope || 'ward:1')}</select>
              <button type="button" data-approve-user="${uid}" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold">Approve</button>
              <button type="button" data-reject-user="${uid}" class="px-2.5 py-1.5 rounded-lg bg-rose-100 text-rose-700 font-bold">Reject</button>
            </div>
          </div>`).join('');

        pendEl.querySelectorAll('[data-approve-user]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const uid = btn.dataset.approveUser;
            const req = authStore.pendingUsers[uid];
            if (!req) return;
            const scope = pendEl.querySelector(`[data-approve-scope="${uid}"]`)?.value || req.requestedScope || 'ward:1';
            authStore.users[uid] = {
              name: req.name || uid, phone: req.phone || '', pinHash: req.pinHash,
              scope, approvedBy: ADMIN_USERNAME, _ts: Date.now()
            };
            delete authStore.pendingUsers[uid];
            saveAuthLocal();
            await syncAuthToFirebase();
            renderAdminLists();
            if (typeof showToast === 'function') showToast(`Approved @${uid} (${scope})`);
          });
        });

        pendEl.querySelectorAll('[data-reject-user]').forEach(btn => {
          btn.addEventListener('click', async () => {
            delete authStore.pendingUsers[btn.dataset.rejectUser];
            saveAuthLocal();
            await syncAuthToFirebase();
            renderAdminLists();
          });
        });
      }
    }

    const listEl = document.getElementById('admin-users-list');
    if (!listEl) return;
    const entries = Object.entries(authStore.users || {});
    if (!entries.length) {
      listEl.innerHTML = '<div class="text-xs text-slate-500 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">No team members approved yet.</div>';
      return;
    }
    listEl.innerHTML = entries.map(([uid, u]) => `
      <div class="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-xl text-xs">
        <div>
          <div class="font-bold text-slate-900">${u.name || uid} <span class="text-slate-400 font-mono">(@${uid})</span></div>
          <div class="text-[11px] text-indigo-700 font-semibold">Mapped: ${u.scope || 'ward:1'}${u.phone ? ' · ' + u.phone : ''}</div>
        </div>
        <button type="button" data-del-user="${uid}" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px]">Remove</button>
      </div>`).join('');
    listEl.querySelectorAll('[data-del-user]').forEach(btn => {
      btn.addEventListener('click', async () => {
        delete authStore.users[btn.dataset.delUser];
        saveAuthLocal();
        await syncAuthToFirebase();
        renderAdminLists();
      });
    });
  }

  function applySessionUI() {
    const gate = document.getElementById('auth-gate');
    const adminBtn = document.getElementById('admin-panel-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const resetBtn = document.getElementById('reset-progress-btn');
    if (!currentSession) {
      gate?.classList.remove('hidden'); adminBtn?.classList.add('hidden'); logoutBtn?.classList.add('hidden');
      return;
    }
    gate?.classList.add('hidden'); logoutBtn?.classList.remove('hidden');
    const isAdmin = currentSession.role === 'admin';
    adminBtn?.classList.toggle('hidden', !isAdmin);
    resetBtn?.classList.toggle('hidden', !isAdmin);
    updateAdminPendingBadge();

    if (!isAdmin && currentSession.scope && currentSession.scope.startsWith('ward:') && state.selectedWard === 'all') {
      const w = Number(currentSession.scope.split(':')[1]);
      state.selectedZone = w <= 7 ? 'east' : 'west';
      state.selectedWard = w;
    }
    if (typeof renderAll === 'function') renderAll();
  }

  async function init() {
    loadAuthLocal();
    injectUI();
    await pullAuthFromFirebase();

    let loginMode = 'member';
    const tabM = document.getElementById('tab-login-member');
    const tabS = document.getElementById('tab-signup-member');
    const tabA = document.getElementById('tab-login-admin');
    const extraS = document.getElementById('signup-extra-fields');
    const uIn = document.getElementById('auth-username');
    const pIn = document.getElementById('auth-pin');
    const hint = document.getElementById('auth-hint');
    const err = document.getElementById('auth-error');
    const msg = document.getElementById('auth-msg');
    const submitBtn = document.getElementById('auth-submit-btn');

    function setMode(m) {
      loginMode = m; err.classList.add('hidden'); msg.classList.add('hidden');
      const activeCls = 'py-2 rounded-lg font-bold bg-white text-indigo-700 shadow-xs';
      const idleCls = 'py-2 rounded-lg font-bold text-slate-600';
      tabM.className = m === 'member' ? activeCls : idleCls;
      tabS.className = m === 'signup' ? activeCls : idleCls;
      tabA.className = m === 'admin' ? activeCls : idleCls;
      extraS.classList.toggle('hidden', m !== 'signup');

      if (m === 'admin') {
        uIn.value = ADMIN_USERNAME; uIn.readOnly = true;
        submitBtn.textContent = 'Sign In as Admin';
        hint.textContent = authStore.adminHash
          ? 'Repo owner login (veerusgithub). Enter your Admin PIN.'
          : 'First-time Admin setup (veerusgithub): enter a new Admin PIN (min 4 chars) to register.';
      } else if (m === 'signup') {
        uIn.value = ''; uIn.readOnly = false;
        submitBtn.textContent = 'Request Account Approval';
        hint.textContent = 'Choose a username, PIN, and your ward. Admin (veerusgithub) will approve your access.';
      } else {
        uIn.value = ''; uIn.readOnly = false;
        submitBtn.textContent = 'Sign In';
        hint.textContent = 'Enter your approved username and PIN.';
      }
    }

    tabM.addEventListener('click', () => setMode('member'));
    tabS.addEventListener('click', () => setMode('signup'));
    tabA.addEventListener('click', () => setMode('admin'));
    setMode(authStore.adminHash ? 'member' : 'admin');

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault(); err.classList.add('hidden'); msg.classList.add('hidden');
      await pullAuthFromFirebase();

      const uname = uIn.value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      const pin = pIn.value.trim();
      if (!uname || pin.length < 4) { err.textContent = 'Enter a valid username and PIN (min 4 characters).'; err.classList.remove('hidden'); return; }
      const h = await hashPin(pin);

      if (loginMode === 'signup') {
        if (uname === ADMIN_USERNAME || authStore.users[uname]) { err.textContent = 'That username is already taken.'; err.classList.remove('hidden'); return; }
        const fullName = document.getElementById('auth-fullname').value.trim() || uname;
        const phone = document.getElementById('auth-phone').value.trim();
        const requestedScope = document.getElementById('auth-req-scope').value;
        await submitPendingSignupToFirebase(uname, {
          name: fullName, phone, pinHash: h, requestedScope, requestedAt: Date.now(), status: 'pending'
        });
        pIn.value = '';
        msg.textContent = `Request submitted for @${uname} (${requestedScope}). Ask Admin (${ADMIN_USERNAME}) to approve your sign-in.`;
        msg.classList.remove('hidden');
        return;
      }

      if (loginMode === 'admin' || uname === ADMIN_USERNAME) {
        if (uname !== ADMIN_USERNAME) { err.textContent = 'Only veerusgithub can sign in as Admin.'; err.classList.remove('hidden'); return; }
        if (!authStore.adminHash) { authStore.adminHash = h; saveAuthLocal(); await syncAuthToFirebase(); }
        else if (authStore.adminHash !== h) { err.textContent = 'Incorrect Admin PIN.'; err.classList.remove('hidden'); return; }
        saveSession({ username: ADMIN_USERNAME, name: 'Admin (veerusgithub)', role: 'admin', scope: 'all' });
        pIn.value = ''; applySessionUI();
      } else {
        if (authStore.pendingUsers && authStore.pendingUsers[uname]) { err.textContent = 'Your account is still pending Admin approval.'; err.classList.remove('hidden'); return; }
        const rec = authStore.users && authStore.users[uname];
        if (!rec || rec.pinHash !== h) { err.textContent = 'Invalid username or PIN.'; err.classList.remove('hidden'); return; }
        saveSession({ username: uname, name: rec.name || uname, role: 'member', scope: rec.scope || 'ward:1' });
        pIn.value = ''; applySessionUI();
      }
    });

    document.getElementById('admin-panel-btn')?.addEventListener('click', async () => {
      await pullAuthFromFirebase(); renderAdminLists(); document.getElementById('admin-modal').classList.remove('hidden');
    });
    document.getElementById('close-admin-modal')?.addEventListener('click', () => {
      document.getElementById('admin-modal').classList.add('hidden');
    });
    document.getElementById('add-user-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-user-name').value.trim();
      const uid = document.getElementById('new-user-id').value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      const pin = document.getElementById('new-user-pin').value.trim();
      const scope = document.getElementById('new-user-scope').value;
      if (!uid || uid === ADMIN_USERNAME || pin.length < 4) return;
      authStore.users[uid] = { name: name || uid, pinHash: await hashPin(pin), scope, approvedBy: ADMIN_USERNAME, _ts: Date.now() };
      delete authStore.pendingUsers[uid];
      saveAuthLocal(); await syncAuthToFirebase(); e.target.reset(); renderAdminLists();
      if (typeof showToast === 'function') showToast('Saved member @' + uid);
    });
    document.getElementById('change-admin-pin-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const np = document.getElementById('new-admin-pin').value.trim();
      if (np.length < 4) return;
      authStore.adminHash = await hashPin(np);
      saveAuthLocal(); await syncAuthToFirebase(); e.target.reset();
      if (typeof showToast === 'function') showToast('Admin PIN updated in Firebase');
    });
    document.getElementById('seed-voters-fb-btn')?.addEventListener('click', async () => {
      const stEl = document.getElementById('seed-voters-status');
      stEl.classList.remove('hidden'); stEl.textContent = 'Uploading voters to Firebase...';
      if (typeof window.seedAllVotersToFirebase === 'function') {
        await window.seedAllVotersToFirebase((done, total) => {
          stEl.textContent = `Uploaded ${done.toLocaleString()} / ${total.toLocaleString()} voters...`;
        });
        stEl.textContent = 'All 5,655 voters + campaign statuses synced to Firebase!';
      }
    });
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      saveSession(null); applySessionUI(); setMode('member');
    });
    applySessionUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
