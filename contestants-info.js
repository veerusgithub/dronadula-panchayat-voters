// contestants-info.js — Public Contestants & Election Symbols Directory (Admin-Editable, Firebase-Synced)
(function () {
  'use strict';

  const STORE_KEY = 'dronadula_contestants_v1';
  const DEFAULT_FB_URL = 'https://voter-list-17964-default-rtdb.firebaseio.com';
  const DEFAULT_ROOM = 'dronadula_main';

  let contestants = [];
  let activeRoleFilter = 'all';

  function getFbBase() {
    const raw = (typeof fbConfig !== 'undefined' && fbConfig.url) ? fbConfig.url : DEFAULT_FB_URL;
    return String(raw || '').trim().replace(/\/+$/, '');
  }
  function getFbRoom() {
    const r = (typeof fbConfig !== 'undefined' && fbConfig.room) ? fbConfig.room : DEFAULT_ROOM;
    return encodeURIComponent(r || DEFAULT_ROOM);
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) contestants = arr;
      }
    } catch (e) {}
  }
  function saveLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(contestants)); } catch (e) {}
  }

  async function pullFromFirebase() {
    try {
      const res = await fetch(`${getFbBase()}/rooms/${getFbRoom()}/contestants.json`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          contestants = Object.values(data).filter(Boolean).sort((a, b) => (a.order || 99) - (b.order || 99) || (a._ts || 0) - (b._ts || 0));
          saveLocal();
          renderList();
        }
      }
    } catch (e) {}
  }

  async function saveItemToFirebase(item) {
    try {
      await fetch(`${getFbBase()}/rooms/${getFbRoom()}/contestants/${encodeURIComponent(item.id)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
    } catch (e) {}
  }

  async function deleteItemFromFirebase(id) {
    try {
      await fetch(`${getFbBase()}/rooms/${getFbRoom()}/contestants/${encodeURIComponent(id)}.json`, {
        method: 'DELETE'
      });
    } catch (e) {}
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function roleLabel(role) {
    if (role === 'sarpanch') return 'Sarpanch · సర్పంచ్';
    if (role && role.startsWith('ward:')) return `Ward ${role.split(':')[1]} · వార్డు ${role.split(':')[1]}`;
    return role || 'Contestant';
  }

  function renderList() {
    const listEl = document.getElementById('contestants-list');
    const adminForm = document.getElementById('contestant-admin-form');
    if (adminForm) {
      const isAdmin = typeof window.isAdminUser === 'function' && window.isAdminUser();
      adminForm.classList.toggle('hidden', !isAdmin);
    }
    if (!listEl) return;

    const isAdmin = typeof window.isAdminUser === 'function' && window.isAdminUser();
    const filtered = contestants.filter(c => {
      if (activeRoleFilter === 'all') return true;
      if (activeRoleFilter === 'sarpanch') return c.role === 'sarpanch';
      if (activeRoleFilter === 'current_ward') {
        if (typeof state !== 'undefined' && state.selectedWard !== 'all') return c.role === `ward:${state.selectedWard}`;
        return true;
      }
      return c.role === activeRoleFilter;
    });

    if (!filtered.length) {
      listEl.innerHTML = `
        <div class="p-5 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
          <div class="text-sm font-bold text-slate-700">Contestants &amp; Election Symbols</div>
          <p class="text-xs text-slate-500">అభ్యర్థులు మరియు ఎన్నికల గుర్తుల వివరాలు త్వరలో ఇక్కడ అప్‌డేట్ చేయబడతాయి.</p>
          <p class="text-[11px] text-slate-400">${isAdmin ? 'Use the form above to add Sarpanch & Ward contestants and their symbols.' : 'Contestant symbols will appear here once updated by the admin.'}</p>
        </div>`;
      return;
    }

    listEl.innerHTML = filtered.map(c => `
      <div class="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs">
        <div class="w-14 h-14 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0 overflow-hidden">
          ${c.symbolImg
            ? `<img src="${esc(c.symbolImg)}" alt="${esc(c.symbolName)}" class="w-12 h-12 object-contain" />`
            : `<span class="text-2xl">${esc(c.symbolIcon || '🗳️')}</span>`}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold ${c.role === 'sarpanch' ? 'bg-amber-100 text-amber-900' : 'bg-indigo-100 text-indigo-800'}">${esc(roleLabel(c.role))}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">Symbol: ${esc(c.symbolName)}</span>
          </div>
          <div class="text-sm font-extrabold text-slate-900 truncate mt-1">${esc(c.name)}</div>
          ${c.note ? `<div class="text-[11px] text-slate-500 truncate mt-0.5">${esc(c.note)}</div>` : ''}
        </div>
        ${isAdmin ? `<button type="button" data-del-c="${esc(c.id)}" class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold shrink-0">Remove</button>` : ''}
      </div>`).join('');

    if (isAdmin) {
      listEl.querySelectorAll('[data-del-c]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.delC;
          contestants = contestants.filter(x => x.id !== id);
          saveLocal();
          await deleteItemFromFirebase(id);
          renderList();
          if (typeof showToast === 'function') showToast('Contestant removed');
        });
      });
    }
  }

  window._refreshContestantsUI = renderList;

  function injectUI() {
    const langBtn = document.getElementById('lang-toggle');
    if (langBtn && !document.getElementById('symbols-btn')) {
      langBtn.insertAdjacentHTML('beforebegin',
        `<button id="symbols-btn" type="button" class="px-2 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-900 text-xs font-extrabold transition">Symbols · గుర్తులు</button>`);
    }

    if (!document.getElementById('contestants-modal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="contestants-modal" class="hidden fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
            <div class="px-4 py-3.5 bg-indigo-700 text-white flex items-center justify-between">
              <div>
                <h3 class="text-sm font-extrabold">Contestants &amp; Symbols · అభ్యర్థులు &amp; గుర్తులు</h3>
                <p class="text-[11px] text-indigo-100">Dronadula Panchayat Election Information</p>
              </div>
              <button id="close-contestants-modal" type="button" class="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold">Close</button>
            </div>
            <div class="px-4 pt-3 pb-2 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button type="button" data-cfilter="all" class="c-filter-btn px-3 py-1 rounded-full text-xs font-bold bg-indigo-700 text-white shrink-0">All</button>
              <button type="button" data-cfilter="sarpanch" class="c-filter-btn px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 shrink-0">Sarpanch</button>
              <button type="button" data-cfilter="current_ward" class="c-filter-btn px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 shrink-0">Selected Ward</button>
            </div>
            <div class="p-4 overflow-y-auto space-y-4">
              <form id="contestant-admin-form" class="hidden bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2.5">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-amber-900">Admin: Add Contestant &amp; Symbol</h4>
                <div class="grid grid-cols-2 gap-2">
                  <select id="c-role" class="px-3 py-2 text-xs rounded-xl border border-amber-300 bg-white font-semibold">
                    <option value="sarpanch">Sarpanch (సర్పంచ్)</option>
                    ${Array.from({ length: 14 }, (_, i) => `<option value="ward:${i + 1}">Ward ${i + 1} Member</option>`).join('')}
                  </select>
                  <input id="c-name" type="text" required placeholder="Contestant Name" class="px-3 py-2 text-xs rounded-xl border border-amber-300 bg-white" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <input id="c-sym-name" type="text" required placeholder="Symbol Name (e.g. Ring / ఉంగరం)" class="px-3 py-2 text-xs rounded-xl border border-amber-300 bg-white" />
                  <input id="c-sym-icon" type="text" placeholder="Emoji (e.g. 💍) or leave blank" class="px-3 py-2 text-xs rounded-xl border border-amber-300 bg-white" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <input id="c-sym-img" type="url" placeholder="Optional Symbol Image URL" class="px-3 py-2 text-xs rounded-xl border border-amber-300 bg-white" />
                  <input id="c-note" type="text" placeholder="Optional Note (e.g. Serial #1)" class="px-3 py-2 text-xs rounded-xl border border-amber-300 bg-white" />
                </div>
                <button type="submit" class="w-full py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold">Save &amp; Publish to All Users</button>
              </form>
              <div id="contestants-list" class="space-y-2"></div>
            </div>
          </div>
        </div>`);
    }
  }

  function init() {
    loadLocal();
    injectUI();
    pullFromFirebase();

    const modal = document.getElementById('contestants-modal');
    document.getElementById('symbols-btn')?.addEventListener('click', () => {
      pullFromFirebase();
      renderList();
      modal.classList.remove('hidden');
    });
    document.getElementById('close-contestants-modal')?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    modal?.querySelectorAll('.c-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeRoleFilter = btn.dataset.cfilter;
        modal.querySelectorAll('.c-filter-btn').forEach(b => {
          const active = b.dataset.cfilter === activeRoleFilter;
          b.className = active
            ? 'c-filter-btn px-3 py-1 rounded-full text-xs font-bold bg-indigo-700 text-white shrink-0'
            : 'c-filter-btn px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 shrink-0';
        });
        renderList();
      });
    });

    document.getElementById('contestant-admin-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const role = document.getElementById('c-role').value;
      const item = {
        id: 'c_' + Date.now(),
        role,
        order: role === 'sarpanch' ? 0 : Number(role.split(':')[1] || 99),
        name: document.getElementById('c-name').value.trim(),
        symbolName: document.getElementById('c-sym-name').value.trim(),
        symbolIcon: document.getElementById('c-sym-icon').value.trim() || '🗳️',
        symbolImg: document.getElementById('c-sym-img').value.trim(),
        note: document.getElementById('c-note').value.trim(),
        _ts: Date.now()
      };
      if (!item.name || !item.symbolName) return;
      contestants.push(item);
      contestants.sort((a, b) => (a.order || 99) - (b.order || 99) || (a._ts || 0) - (b._ts || 0));
      saveLocal();
      await saveItemToFirebase(item);
      e.target.reset();
      renderList();
      if (typeof showToast === 'function') showToast('Contestant symbol published!');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
