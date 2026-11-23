// auth-admin.js — Repo Owner (veerusgithub) Admin Role, Self-Signup + Admin Approval Gate & Firebase Voter Uploader
(function () {
  'use strict';

  const ADMIN_USERNAME = 'veerusgithub';
  const AUTH_STORE_KEY = 'dronadula_auth_v1';
  const SESSION_KEY = 'dronadula_session_v1';

  let authStore = { adminHash: '', users: {}, pendingUsers: {} };
  let currentSession = null;

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
        authStore = {
          adminHash: p.adminHash || '',
          users: p.users || {},
          pendingUsers: p.pendingUsers || {}
        };
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

  function getFbBase() {
    const rawUrl = (typeof fbConfig !== 'undefined' && fbConfig.url && fbConfig.url.trim()) ? fbConfig.url : 'https://voter-list-17964-default-rtdb.firebaseio.com';
    const base = typeof cleanFbUrl === 'function' ? cleanFbUrl(rawUrl) : rawUrl.trim().replace(/\/+$/, '');
    const room = encodeURIComponent((typeof fbConfig !== 'undefined' && fbConfig.room) || (typeof DEFAULT_ROOM !== 'undefined' ? DEFAULT_ROOM : 'dronadula_main'));
    return `${base}/rooms/${room}`;
  }

  window._mergeRemoteAuth = function (remoteAuth) {
    if (!remoteAuth || typeof remoteAuth !== 'object') return;
    if (remoteAuth.adminHash && !authStore.adminHash) authStore.adminHash = remoteAuth.adminHash;
    if (remoteAuth.users && typeof remoteAuth.users === 'object') {
      authStore.users = { ...authStore.users, ...remoteAuth.users };
    }
    if (remoteAuth.pendingUsers && typeof remoteAuth.pendingUsers === 'object') {
      const mergedPending = { ...authStore.pendingUsers, ...remoteAuth.pendingUsers };
      for (const uid of Object.keys(authStore.users)) delete mergedPending[uid];
      authStore.pendingUsers = mergedPending;
    }
    saveAuthLocal();
    updateAdminBadge();
    renderAdminModalLists();
  };

  async function pullAuthFromFirebase() {
    const fb = getFbBase();
    if (!fb) return;
    try {
      const res = await fetch(`${fb}/auth.json`);
      if (!res.ok) return;
      const data = await res.json();
      if (data) window._mergeRemoteAuth(data);
    } catch (e) {}
  }

  async function syncAuthToFirebase() {
    const fb = getFbBase();
    if (!fb) return;
    try {
      await fetch(`${fb}/auth.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authStore)
      });
    } catch (e) {}
  }

  async function uploadAllVotersToFirebase(statusEl) {
    const fb = getFbBase();
    if (!fb) {
      if (statusEl) statusEl.textContent = 'Connect your Firebase Realtime Database URL in Sync first.';
      return;
    }
    if (!state || !state.voters || !state.voters.length) return;
    try {
      if (statusEl) statusEl.textContent = 'Uploading voters by ward (0/14)...';
      const byWard = {};
      for (const v of state.voters) {
        if (!byWard[v.ward]) byWard[v.ward] = {};
        byWard[v.ward][v.gp] = {
          gp: v.gp, ward: v.ward, asm: v.asm, name: v.name,
          relType: v.relType, relName: v.relName, age: v.age,
          gender: v.gender, house: v.house, epic: v.epic
        };
      }
      const wards = Object.keys(byWard).sort((a, b) => Number(a) - Number(b));
      for (let i = 0; i < wards.length; i++) {
        const w = wards[i];
        await fetch(`${fb}/voters_by_ward/ward_${w}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(byWard[w])
        });
        if (statusEl) statusEl.textContent = `Uploaded Ward ${w} (${i + 1}/${wards.length})...`;
      }
      if (state.campaign && Object.keys(state.campaign).length > 0) {
        await fetch(`${fb}/campaign.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state.campaign)
        });
      }
      await fetch(`${fb}/meta_info.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalVoters: state.voters.length, wards: wards.length, lastSeedTs: Date.now() })
      });
      if (statusEl) statusEl.textContent = `Done: uploaded all ${state.voters.length} voters & saved statuses to Firebase.`;
      if (typeof showToast === 'function') showToast('Uploaded all voters & statuses to Firebase');
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Upload failed: check Firebase URL and Database Rules.';
    }
  }

  const origGetZoneWards = window.getZoneWards;
  window.getZoneWards = function (zone = state.selectedZone) {
    let base = typeof origGetZoneWards === 'function' ? origGetZoneWards(zone) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14];
    if (currentSession && currentSession.role !== 'admin' && currentSession.scope && currentSession.scope !== 'all') {
      if (currentSession.scope === 'east') base = base.filter(w => w >= 1 && w <= 7);
      else if (currentSession.scope === 'west') base = base.filter(w => w >= 8 && w <= 14);
      else if (currentSession.scope.startsWith('ward:')) {
        const w = Number(currentSession.scope.split(':')[1]);
        base = base.filter(x => x === w);
      }
    }
    return base;
  };

  window.getZoneVoters = function (zone = state.selectedZone) {
    const allowed = new Set(window.getZoneWards(zone));
    return state.voters.filter(v => allowed.has(v.ward));
  };

  function updateAdminBadge() {
    const btn = document.getElementById('admin-panel-btn');
    if (!btn) return;
    const pCount = Object.keys(authStore.pendingUsers || {}).length;
    btn.textContent = pCount > 0 ? `Admin (${pCount})` : 'Admin';
  }

  const scopeOptionsHtml = `
    <option value="all">All Wards (1–14)</option>
    <option value="east">East (Wards 1–7)</option>
    <option value="west">West (Wards 8–14)</option>
    ${Array.from({ length: 14 }, (_, i) => `<option value="ward:${i + 1}">Ward ${i + 1} only</option>`).join('')}
  `;

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

    if (!document.getElementById('auth-gate')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="auth-gate" class="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
          <div class="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
            <div class="bg-indigo-700 text-white p-5 text-center">
              <h2 class="text-lg font-extrabold leading-tight">ద్రోణాదుల పంచాయతీ ఓటర్లు</h2>
              <p class="text-xs text-indigo-100 mt-0.5">104-Parchur · 14 Wards · 5,655 Voters</p>
            </div>
            <div class="p-5 space-y-4">
              <div class="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
                <button id="tab-login-member" type="button" class="py-2 rounded-lg text-[11px] font-bold bg-white text-indigo-700 shadow-xs transition">Sign In</button>
                <button id="tab-login-signup" type="button" class="py-2 rounded-lg text-[11px] font-bold text-slate-600 hover:text-slate-900 transition">Create Account</button>
                <button id="tab-login-admin" type="button" class="py-2 rounded-lg text-[11px] font-bold text-slate-600 hover:text-slate-900 transition">Admin</button>
              </div>
              <form id="auth-form" class="space-y-3">
                <div id="signup-name-wrap" class="hidden">
                  <label class="block text-xs font-bold text-slate-700 mb-1" for="auth-fullname">Full Name</label>
                  <input id="auth-fullname" type="text" placeholder="Your full name"
                    class="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1" for="auth-username">Username</label>
                  <input id="auth-username" type="text" autocomplete="username" required placeholder="Enter username"
                    class="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1" for="auth-pin">PIN / Passcode</label>
                  <input id="auth-pin" type="password" autocomplete="current-password" required minlength="4" placeholder="Enter PIN (min 4 chars)"
                    class="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div id="signup-scope-wrap" class="hidden">
                  <label class="block text-xs font-bold text-slate-700 mb-1" for="auth-req-scope">Requested Access</label>
                  <select id="auth-req-scope" class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-semibold">
                    ${scopeOptionsHtml}
                  </select>
                </div>
                <p id="auth-hint" class="text-[11px] text-slate-500 leading-snug"></p>
                <p id="auth-error" class="hidden text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"></p>
                <p id="auth-ok" class="hidden text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"></p>
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
                <p class="text-[11px] text-indigo-100">Approve sign-in requests, manage team &amp; Firebase data</p>
              </div>
              <button id="close-admin-modal" type="button" class="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold">Close</button>
            </div>
            <div class="p-4 overflow-y-auto space-y-4">
              <div class="space-y-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-amber-800">Pending Sign-In Requests</h4>
                <div id="admin-pending-list" class="space-y-2"></div>
              </div>

              <form id="add-user-form" class="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-slate-700">Add / Update Team Member Directly</h4>
                <div class="grid grid-cols-2 gap-2">
                  <input id="new-user-name" type="text" required placeholder="Full Name" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                  <input id="new-user-id" type="text" required placeholder="Username (e.g. ward8)" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <input id="new-user-pin" type="password" required minlength="4" placeholder="PIN (min 4 chars)" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                  <select id="new-user-scope" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-semibold">${scopeOptionsHtml}</select>
                </div>
                <button type="submit" class="w-full py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold">Save Team Member</button>
              </form>

              <div class="space-y-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-slate-600">Approved Team Members</h4>
                <div id="admin-users-list" class="space-y-1.5"></div>
              </div>

              <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-emerald-900">Firebase Master Backup</h4>
                <p class="text-[11px] text-emerald-800">Upload all 5,655 voters (ward-by-ward) and their saved campaign statuses to Firebase without overwriting existing progress.</p>
                <button id="fb-seed-voters-btn" type="button" class="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">Upload All Voters &amp; Statuses to Firebase</button>
                <div id="fb-seed-status" class="text-[11px] font-semibold text-emerald-900"></div>
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

  function renderAdminModalLists() {
    const pendEl = document.getElementById('admin-pending-list');
    if (pendEl) {
      const pend = Object.entries(authStore.pendingUsers || {});
      if (!pend.length) {
        pendEl.innerHTML = '<div class="text-xs text-slate-500 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">No pending sign-in requests.</div>';
      } else {
        pendEl.innerHTML = pend.map(([uid, u]) => `
          <div class="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-bold text-slate-900">${u.name || uid} <span class="text-slate-500 font-mono">(@${uid})</span></div>
                <div class="text-[11px] text-amber-900">Requested: ${u.scope || 'all'}</div>
              </div>
              <select data-approve-scope="${uid}" class="px-2 py-1 text-[11px] rounded-lg border border-amber-300 bg-white font-semibold">
                ${scopeOptionsHtml.replace(`value="${u.scope || 'all'}"`, `value="${u.scope || 'all'}" selected`)}
              </select>
            </div>
            <div class="flex gap-2">
              <button type="button" data-approve-user="${uid}" class="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]">Approve</button>
              <button type="button" data-reject-user="${uid}" class="flex-1 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[11px]">Reject</button>
            </div>
          </div>`).join('');

        pendEl.querySelectorAll('[data-approve-user]').forEach(btn => {
          btn.addEventListener('click', () => {
            const uid = btn.dataset.approveUser;
            const req = authStore.pendingUsers[uid];
            if (!req) return;
            const sel = pendEl.querySelector(`[data-approve-scope="${uid}"]`);
            authStore.users[uid] = { name: req.name || uid, pinHash: req.pinHash, scope: sel ? sel.value : (req.scope || 'all'), approvedAt: Date.now() };
            delete authStore.pendingUsers[uid];
            saveAuthLocal(); syncAuthToFirebase(); updateAdminBadge(); renderAdminModalLists();
            if (typeof showToast === 'function') showToast(`Approved @${uid}`);
          });
        });
        pendEl.querySelectorAll('[data-reject-user]').forEach(btn => {
          btn.addEventListener('click', () => {
            const uid = btn.dataset.rejectUser;
            delete authStore.pendingUsers[uid];
            saveAuthLocal(); syncAuthToFirebase(); updateAdminBadge(); renderAdminModalLists();
            if (typeof showToast === 'function') showToast(`Rejected @${uid}`);
          });
        });
      }
    }

    const listEl = document.getElementById('admin-users-list');
    if (listEl) {
      const entries = Object.entries(authStore.users || {});
      if (!entries.length) {
        listEl.innerHTML = '<div class="text-xs text-slate-500 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">No approved team members yet.</div>';
      } else {
        listEl.innerHTML = entries.map(([uid, u]) => `
          <div class="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-xl text-xs">
            <div>
              <div class="font-bold text-slate-900">${u.name || uid} <span class="text-slate-400 font-mono">(@${uid})</span></div>
              <div class="text-[11px] text-indigo-700 font-semibold">Scope: ${u.scope || 'all'}</div>
            </div>
            <button type="button" data-del-user="${uid}" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px]">Remove</button>
          </div>`).join('');
        listEl.querySelectorAll('[data-del-user]').forEach(btn => {
          btn.addEventListener('click', () => {
            delete authStore.users[btn.dataset.delUser];
            saveAuthLocal(); syncAuthToFirebase(); renderAdminModalLists();
          });
        });
      }
    }
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
    updateAdminBadge();
    if (!isAdmin && currentSession.scope && currentSession.scope !== 'all') {
      if (currentSession.scope === 'east') { state.selectedZone = 'east'; state.selectedWard = 'all'; }
      else if (currentSession.scope === 'west') { state.selectedZone = 'west'; state.selectedWard = 'all'; }
      else if (currentSession.scope.startsWith('ward:')) {
        const w = Number(currentSession.scope.split(':')[1]);
        state.selectedZone = w <= 7 ? 'east' : 'west';
        state.selectedWard = w;
      }
    }
    if (typeof renderAll === 'function') renderAll();
  }

  function init() {
    loadAuthLocal();
    injectUI();
    pullAuthFromFirebase();

    let loginMode = 'member';
    const tabM = document.getElementById('tab-login-member');
    const tabS = document.getElementById('tab-login-signup');
    const tabA = document.getElementById('tab-login-admin');
    const uIn = document.getElementById('auth-username');
    const pIn = document.getElementById('auth-pin');
    const fnWrap = document.getElementById('signup-name-wrap');
    const scWrap = document.getElementById('signup-scope-wrap');
    const fnIn = document.getElementById('auth-fullname');
    const scIn = document.getElementById('auth-req-scope');
    const hint = document.getElementById('auth-hint');
    const err = document.getElementById('auth-error');
    const ok = document.getElementById('auth-ok');
    const subBtn = document.getElementById('auth-submit-btn');

    function setMode(m) {
      loginMode = m;
      err.classList.add('hidden'); ok.classList.add('hidden');
      const activeCls = 'py-2 rounded-lg text-[11px] font-bold bg-white text-indigo-700 shadow-xs transition';
      const idleCls = 'py-2 rounded-lg text-[11px] font-bold text-slate-600 hover:text-slate-900 transition';
      tabM.className = m === 'member' ? activeCls : idleCls;
      tabS.className = m === 'signup' ? activeCls : idleCls;
      tabA.className = m === 'admin' ? activeCls : idleCls;

      fnWrap.classList.toggle('hidden', m !== 'signup');
      scWrap.classList.toggle('hidden', m !== 'signup');
      fnIn.required = m === 'signup';

      if (m === 'admin') {
        uIn.value = ADMIN_USERNAME; uIn.readOnly = true;
        subBtn.textContent = 'Sign In as Admin';
        hint.textContent = authStore.adminHash
          ? 'Repo owner login (veerusgithub). Enter your Admin PIN.'
          : 'First-time Admin setup (veerusgithub): enter any new PIN (4+ chars) to set your Admin PIN.';
      } else if (m === 'signup') {
        uIn.value = ''; uIn.readOnly = false;
        subBtn.textContent = 'Request Account Approval';
        hint.textContent = 'Create your username & PIN. Admin (veerusgithub) will review and approve your access.';
      } else {
        uIn.value = ''; uIn.readOnly = false;
        subBtn.textContent = 'Sign In';
        hint.textContent = 'Enter your approved username and PIN.';
      }
    }

    tabM.addEventListener('click', () => setMode('member'));
    tabS.addEventListener('click', () => setMode('signup'));
    tabA.addEventListener('click', () => setMode('admin'));
    setMode(authStore.adminHash ? 'member' : 'admin');

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      err.classList.add('hidden'); ok.classList.add('hidden');
      await pullAuthFromFirebase();
      const uname = uIn.value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      const pin = pIn.value.trim();
      if (!uname || pin.length < 4) {
        err.textContent = 'Enter a valid username and PIN (min 4 characters).';
        err.classList.remove('hidden'); return;
      }
      const h = await hashPin(pin);

      if (loginMode === 'signup') {
        if (uname === ADMIN_USERNAME || authStore.users[uname]) {
          err.textContent = 'That username is already taken. Try signing in or choose another username.';
          err.classList.remove('hidden'); return;
        }
        authStore.pendingUsers[uname] = {
          name: fnIn.value.trim() || uname,
          pinHash: h,
          scope: scIn.value || 'all',
          requestedAt: Date.now()
        };
        saveAuthLocal(); await syncAuthToFirebase(); updateAdminBadge();
        pIn.value = ''; fnIn.value = ''; uIn.value = '';
        ok.textContent = `Account request submitted for @${uname}. Waiting for Admin (${ADMIN_USERNAME}) approval.`;
        ok.classList.remove('hidden');
        return;
      }

      if (loginMode === 'admin' || uname === ADMIN_USERNAME) {
        if (uname !== ADMIN_USERNAME) {
          err.textContent = 'Only veerusgithub can sign in as Admin.';
          err.classList.remove('hidden'); return;
        }
        if (!authStore.adminHash) {
          authStore.adminHash = h;
          saveAuthLocal(); await syncAuthToFirebase();
        } else if (authStore.adminHash !== h) {
          err.textContent = 'Incorrect Admin PIN.';
          err.classList.remove('hidden'); return;
        }
        saveSession({ username: ADMIN_USERNAME, name: 'Admin (veerusgithub)', role: 'admin', scope: 'all' });
        pIn.value = ''; applySessionUI();
      } else {
        if (authStore.pendingUsers && authStore.pendingUsers[uname]) {
          err.textContent = 'Your account is still pending approval by Admin (veerusgithub).';
          err.classList.remove('hidden'); return;
        }
        const rec = authStore.users && authStore.users[uname];
        if (!rec || rec.pinHash !== h) {
          err.textContent = 'Invalid username or PIN.';
          err.classList.remove('hidden'); return;
        }
        saveSession({ username: uname, name: rec.name || uname, role: 'member', scope: rec.scope || 'all' });
        pIn.value = ''; applySessionUI();
      }
    });

    document.getElementById('admin-panel-btn')?.addEventListener('click', async () => {
      await pullAuthFromFirebase();
      renderAdminModalLists();
      document.getElementById('admin-modal').classList.remove('hidden');
    });
    document.getElementById('close-admin-modal')?.addEventListener('click', () => {
      document.getElementById('admin-modal').classList.add('hidden');
    });
    document.getElementById('fb-seed-voters-btn')?.addEventListener('click', () => {
      uploadAllVotersToFirebase(document.getElementById('fb-seed-status'));
    });
    document.getElementById('add-user-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-user-name').value.trim();
      const uid = document.getElementById('new-user-id').value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      const pin = document.getElementById('new-user-pin').value.trim();
      const scope = document.getElementById('new-user-scope').value;
      if (!uid || uid === ADMIN_USERNAME || pin.length < 4) return;
      authStore.users[uid] = { name: name || uid, pinHash: await hashPin(pin), scope, _ts: Date.now() };
      delete authStore.pendingUsers[uid];
      saveAuthLocal(); syncAuthToFirebase(); updateAdminBadge(); e.target.reset(); renderAdminModalLists();
      if (typeof showToast === 'function') showToast('Saved member @' + uid);
    });
    document.getElementById('change-admin-pin-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const np = document.getElementById('new-admin-pin').value.trim();
      if (np.length < 4) return;
      authStore.adminHash = await hashPin(np);
      saveAuthLocal(); syncAuthToFirebase(); e.target.reset();
      if (typeof showToast === 'function') showToast('Admin PIN updated');
    });
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      saveSession(null); applySessionUI(); setMode('member');
    });
    applySessionUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();';

  const ADMIN_USERNAME = 'veerusgithub';
  const AUTH_STORE_KEY = 'dronadula_auth_v1';
  const SESSION_KEY = 'dronadula_session_v1';

  let authStore = { adminHash: '', users: {} };
  let currentSession = null;

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
      if (raw) { const p = JSON.parse(raw); authStore = { adminHash: p.adminHash || '', users: p.users || {} }; }
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
    if (remoteAuth.adminHash && !authStore.adminHash) authStore.adminHash = remoteAuth.adminHash;
    if (remoteAuth.users && typeof remoteAuth.users === 'object') {
      authStore.users = { ...authStore.users, ...remoteAuth.users };
    }
    saveAuthLocal();
  };

  async function syncAuthToFirebase() {
    const rawUrl = (typeof fbConfig !== 'undefined' && fbConfig.url && fbConfig.url.trim()) ? fbConfig.url : 'https://voter-list-17964-default-rtdb.firebaseio.com';
    try {
      const base = typeof cleanFbUrl === 'function' ? cleanFbUrl(rawUrl) : rawUrl.trim().replace(/\/+$/, '');
      const room = encodeURIComponent((typeof fbConfig !== 'undefined' && fbConfig.room) || (typeof DEFAULT_ROOM !== 'undefined' ? DEFAULT_ROOM : 'dronadula_main'));
      await fetch(`${base}/rooms/${room}/auth.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authStore)
      });
    } catch (e) {}
  }

  const origGetZoneWards = window.getZoneWards;
  window.getZoneWards = function (zone = state.selectedZone) {
    let base = typeof origGetZoneWards === 'function' ? origGetZoneWards(zone) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14];
    if (currentSession && currentSession.role !== 'admin' && currentSession.scope && currentSession.scope !== 'all') {
      if (currentSession.scope === 'east') base = base.filter(w => w >= 1 && w <= 7);
      else if (currentSession.scope === 'west') base = base.filter(w => w >= 8 && w <= 14);
      else if (currentSession.scope.startsWith('ward:')) {
        const w = Number(currentSession.scope.split(':')[1]);
        base = base.filter(x => x === w);
      }
    }
    return base;
  };

  window.getZoneVoters = function (zone = state.selectedZone) {
    const allowed = new Set(window.getZoneWards(zone));
    return state.voters.filter(v => allowed.has(v.ward));
  };

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

    if (!document.getElementById('auth-gate')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="auth-gate" class="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
          <div class="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
            <div class="bg-indigo-700 text-white p-5 text-center">
              <h2 class="text-lg font-extrabold leading-tight">ద్రోణాదుల పంచాయతీ ఓటర్లు</h2>
              <p class="text-xs text-indigo-100 mt-0.5">104-Parchur · 14 Wards · 5,655 Voters</p>
            </div>
            <div class="p-5 space-y-4">
              <div class="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button id="tab-login-member" type="button" class="py-2 rounded-lg text-xs font-bold bg-white text-indigo-700 shadow-xs transition">Team Login</button>
                <button id="tab-login-admin" type="button" class="py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition">Admin (Owner)</button>
              </div>
              <form id="auth-form" class="space-y-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1" for="auth-username">Username</label>
                  <input id="auth-username" type="text" autocomplete="username" required placeholder="Enter username"
                    class="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 mb-1" for="auth-pin">PIN / Passcode</label>
                  <input id="auth-pin" type="password" autocomplete="current-password" required minlength="4" placeholder="Enter PIN (min 4 chars)"
                    class="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <p id="auth-hint" class="text-[11px] text-slate-500 leading-snug"></p>
                <p id="auth-error" class="hidden text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"></p>
                <button type="submit" class="w-full py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold shadow-sm transition">Sign In</button>
              </form>
            </div>
          </div>
        </div>

        <div id="admin-modal" class="hidden fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
            <div class="px-4 py-3.5 bg-indigo-700 text-white flex items-center justify-between">
              <div>
                <h3 class="text-sm font-extrabold">Admin Panel · ${ADMIN_USERNAME}</h3>
                <p class="text-[11px] text-indigo-100">Manage team logins &amp; ward access</p>
              </div>
              <button id="close-admin-modal" type="button" class="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold">Close</button>
            </div>
            <div class="p-4 overflow-y-auto space-y-4">
              <form id="add-user-form" class="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-slate-700">Add / Update Team Member</h4>
                <div class="grid grid-cols-2 gap-2">
                  <input id="new-user-name" type="text" required placeholder="Full Name" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                  <input id="new-user-id" type="text" required placeholder="Username (e.g. ward8)" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <input id="new-user-pin" type="password" required minlength="4" placeholder="PIN (min 4 chars)" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                  <select id="new-user-scope" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-semibold">
                    <option value="all">All Wards (1–14)</option>
                    <option value="east">East (Wards 1–7)</option>
                    <option value="west">West (Wards 8–14)</option>
                    ${Array.from({ length: 14 }, (_, i) => `<option value="ward:${i + 1}">Ward ${i + 1} only</option>`).join('')}
                  </select>
                </div>
                <button type="submit" class="w-full py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold">Save Team Member</button>
              </form>
              <div class="space-y-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-slate-600">Team Members</h4>
                <div id="admin-users-list" class="space-y-1.5"></div>
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

  function renderAdminUsersList() {
    const listEl = document.getElementById('admin-users-list');
    if (!listEl) return;
    const entries = Object.entries(authStore.users || {});
    if (!entries.length) {
      listEl.innerHTML = '<div class="text-xs text-slate-500 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">No team members added yet.</div>';
      return;
    }
    listEl.innerHTML = entries.map(([uid, u]) => `
      <div class="flex items-center justify-between gap-2 p-2.5 bg-white border border-slate-200 rounded-xl text-xs">
        <div>
          <div class="font-bold text-slate-900">${u.name || uid} <span class="text-slate-400 font-mono">(@${uid})</span></div>
          <div class="text-[11px] text-indigo-700 font-semibold">Scope: ${u.scope || 'all'}</div>
        </div>
        <button type="button" data-del-user="${uid}" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px]">Remove</button>
      </div>`).join('');
    listEl.querySelectorAll('[data-del-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        delete authStore.users[btn.dataset.delUser];
        saveAuthLocal(); syncAuthToFirebase(); renderAdminUsersList();
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
    if (!isAdmin && currentSession.scope && currentSession.scope !== 'all') {
      if (currentSession.scope === 'east') { state.selectedZone = 'east'; state.selectedWard = 'all'; }
      else if (currentSession.scope === 'west') { state.selectedZone = 'west'; state.selectedWard = 'all'; }
      else if (currentSession.scope.startsWith('ward:')) {
        const w = Number(currentSession.scope.split(':')[1]);
        state.selectedZone = w <= 7 ? 'east' : 'west';
        state.selectedWard = w;
      }
    }
    if (typeof renderAll === 'function') renderAll();
  }

  function init() {
    loadAuthLocal();
    injectUI();
    let loginMode = 'member';
    const tabM = document.getElementById('tab-login-member');
    const tabA = document.getElementById('tab-login-admin');
    const uIn = document.getElementById('auth-username');
    const pIn = document.getElementById('auth-pin');
    const hint = document.getElementById('auth-hint');
    const err = document.getElementById('auth-error');

    function setMode(m) {
      loginMode = m; err.classList.add('hidden');
      if (m === 'admin') {
        tabA.className = 'py-2 rounded-lg text-xs font-bold bg-white text-indigo-700 shadow-xs transition';
        tabM.className = 'py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition';
        uIn.value = ADMIN_USERNAME; uIn.readOnly = true;
        hint.textContent = authStore.adminHash
          ? 'Repo owner login (veerusgithub). Enter your Admin PIN.'
          : 'First-time Admin setup (veerusgithub): enter a new Admin PIN (min 4 chars) to register.';
      } else {
        tabM.className = 'py-2 rounded-lg text-xs font-bold bg-white text-indigo-700 shadow-xs transition';
        tabA.className = 'py-2 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 transition';
        uIn.value = ''; uIn.readOnly = false;
        hint.textContent = 'Enter the username and PIN assigned by Admin (veerusgithub).';
      }
    }

    tabM.addEventListener('click', () => setMode('member'));
    tabA.addEventListener('click', () => setMode('admin'));
    setMode(authStore.adminHash ? 'member' : 'admin');

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault(); err.classList.add('hidden');
      const uname = uIn.value.trim().toLowerCase();
      const pin = pIn.value.trim();
      if (pin.length < 4) { err.textContent = 'PIN must be at least 4 characters.'; err.classList.remove('hidden'); return; }
      const h = await hashPin(pin);
      if (loginMode === 'admin' || uname === ADMIN_USERNAME) {
        if (uname !== ADMIN_USERNAME) { err.textContent = 'Only veerusgithub can sign in as Admin.'; err.classList.remove('hidden'); return; }
        if (!authStore.adminHash) { authStore.adminHash = h; saveAuthLocal(); syncAuthToFirebase(); }
        else if (authStore.adminHash !== h) { err.textContent = 'Incorrect Admin PIN.'; err.classList.remove('hidden'); return; }
        saveSession({ username: ADMIN_USERNAME, name: 'Admin (veerusgithub)', role: 'admin', scope: 'all' });
        pIn.value = ''; applySessionUI();
      } else {
        const rec = authStore.users && authStore.users[uname];
        if (!rec || rec.pinHash !== h) { err.textContent = 'Invalid username or PIN.'; err.classList.remove('hidden'); return; }
        saveSession({ username: uname, name: rec.name || uname, role: 'member', scope: rec.scope || 'all' });
        pIn.value = ''; applySessionUI();
      }
    });

    document.getElementById('admin-panel-btn')?.addEventListener('click', () => {
      renderAdminUsersList(); document.getElementById('admin-modal').classList.remove('hidden');
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
      authStore.users[uid] = { name: name || uid, pinHash: await hashPin(pin), scope, _ts: Date.now() };
      saveAuthLocal(); syncAuthToFirebase(); e.target.reset(); renderAdminUsersList();
      if (typeof showToast === 'function') showToast('Saved member @' + uid);
    });
    document.getElementById('change-admin-pin-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const np = document.getElementById('new-admin-pin').value.trim();
      if (np.length < 4) return;
      authStore.adminHash = await hashPin(np);
      saveAuthLocal(); syncAuthToFirebase(); e.target.reset();
      if (typeof showToast === 'function') showToast('Admin PIN updated');
    });
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      saveSession(null); applySessionUI(); setMode('member');
    });
    applySessionUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
