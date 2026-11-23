// contestants-info.js (v3) — Village President (Sarpanch) & Ward 1–14 Contestants + Symbols + Phone Numbers
(function () {
  'use strict';

  const STORE_KEY = 'dronadula_contestants_v1';
  const DEFAULT_FIREBASE_RTDB = 'https://voter-list-17964-default-rtdb.firebaseio.com';
  const DEFAULT_FIREBASE_ROOM = 'dronadula_main';

  let contestants = { president: {}, wards: {} };

  function getFbUrl() {
    const u = (typeof fbConfig !== 'undefined' && fbConfig.url) ? fbConfig.url : DEFAULT_FIREBASE_RTDB;
    const r = (typeof fbConfig !== 'undefined' && fbConfig.room) ? fbConfig.room : DEFAULT_FIREBASE_ROOM;
    return `${String(u).trim().replace(/\/+$/, '')}/rooms/${encodeURIComponent(r)}/contestants.json`;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        contestants = { president: p.president || {}, wards: p.wards || {} };
      }
    } catch (e) {}
  }

  function saveLocal() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(contestants)); } catch (e) {}
  }

  window._mergeRemoteContestants = function (remote) {
    if (!remote || typeof remote !== 'object') return;
    contestants = { president: remote.president || {}, wards: remote.wards || {} };
    saveLocal();
    window.renderActiveWardContestantBanner();
  };

  async function saveToFirebase() {
    saveLocal();
    try {
      await fetch(getFbUrl(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contestants)
      });
    } catch (e) {}
  }

  function isAdmin() {
    const s = typeof window.getCurrentAuthSession === 'function' ? window.getCurrentAuthSession() : null;
    return !!(s && s.role === 'admin');
  }

  function phoneLink(ph) {
    if (!ph) return '';
    const clean = String(ph).replace(/[^0-9+]/g, '');
    return ` <a href="tel:${clean}" class="text-emerald-700 font-bold underline ml-1">📞 ${ph}</a>`;
  }

  window.renderActiveWardContestantBanner = function () {
    const main = document.querySelector('main');
    if (!main) return;
    let el = document.getElementById('ward-contestant-banner');
    const w = state.selectedWard;
    const presList = Object.values(contestants.president || {});
    const wardList = (w && w !== 'all') ? Object.values((contestants.wards && contestants.wards[w]) || {}) : [];

    if (!presList.length && !wardList.length) {
      if (el) el.remove();
      return;
    }

    if (!el) {
      el = document.createElement('div');
      el.id = 'ward-contestant-banner';
      el.className = 'mb-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2';
      const stats = document.getElementById('ward-stats-banner');
      if (stats) stats.insertAdjacentElement('afterend', el);
      else main.prepend(el);
    }

    const parts = [];
    if (wardList.length) {
      parts.push(`<div><span class="font-extrabold text-indigo-900">Ward ${w} Contestants:</span> ${wardList.map(c => `<span class="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded-full border border-indigo-200 font-bold text-slate-800 ml-1">${c.symbolIcon || ''} ${c.name} <span class="text-indigo-700 font-normal">(${c.symbol || 'Symbol'})</span>${phoneLink(c.phone)}</span>`).join('')}</div>`);
    }
    if (presList.length) {
      parts.push(`<div><span class="font-extrabold text-amber-900">Village President:</span> ${presList.map(c => `<span class="inline-flex items-center gap-1 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 font-bold text-slate-900 ml-1">${c.symbolIcon || ''} ${c.name} <span class="text-amber-900 font-normal">(${c.symbol || 'Symbol'})</span>${phoneLink(c.phone)}</span>`).join('')}</div>`);
    }
    el.innerHTML = parts.join('');
  };

  function renderModalContent() {
    const adminMode = isAdmin();
    const formWrap = document.getElementById('contestant-admin-form-wrap');
    if (formWrap) formWrap.classList.toggle('hidden', !adminMode);

    const presEl = document.getElementById('contestants-president-list');
    const presEntries = Object.entries(contestants.president || {});
    presEl.innerHTML = presEntries.length
      ? presEntries.map(([id, c]) => `
          <div class="flex items-center justify-between gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs">
            <div>
              <div class="font-extrabold text-slate-900">${c.symbolIcon || '🏛️'} ${c.name}</div>
              <div class="text-[11px] text-amber-900">Symbol: <b>${c.symbol || '-'}</b>${c.party ? ' · ' + c.party : ''}${phoneLink(c.phone)}</div>
            </div>
            ${adminMode ? `<button type="button" data-del-pres="${id}" class="px-2 py-1 rounded-lg bg-rose-100 text-rose-700 font-bold text-[11px]">Delete</button>` : ''}
          </div>`).join('')
      : '<div class="text-xs text-slate-500 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">No Village President contestants added yet.</div>';

    const wardsEl = document.getElementById('contestants-wards-list');
    const wardBlocks = [];
    for (let w = 1; w <= 14; w++) {
      const entries = Object.entries((contestants.wards && contestants.wards[w]) || {});
      if (!entries.length) continue;
      wardBlocks.push(`
        <div class="border border-slate-200 rounded-xl p-2.5 bg-white space-y-1.5">
          <div class="text-[11px] font-extrabold text-indigo-800 uppercase">Ward ${w}</div>
          ${entries.map(([id, c]) => `
            <div class="flex items-center justify-between gap-2 text-xs py-1 border-t border-slate-100 first:border-0">
              <div><b>${c.symbolIcon || '🗳️'} ${c.name}</b> — <span class="text-indigo-700 font-semibold">${c.symbol || '-'}</span>${c.party ? ` <span class="text-slate-500">(${c.party})</span>` : ''}${phoneLink(c.phone)}</div>
              ${adminMode ? `<button type="button" data-del-ward="${w}" data-del-id="${id}" class="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[11px]">Remove</button>` : ''}
            </div>`).join('')}
        </div>`);
    }
    wardsEl.innerHTML = wardBlocks.length
      ? wardBlocks.join('')
      : '<div class="text-xs text-slate-500 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">No Ward contestants added yet.</div>';

    presEl.querySelectorAll('[data-del-pres]').forEach(btn => {
      btn.addEventListener('click', async () => {
        delete contestants.president[btn.dataset.delPres];
        await saveToFirebase();
        renderModalContent();
        window.renderActiveWardContestantBanner();
      });
    });
    wardsEl.querySelectorAll('[data-del-ward]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const w = btn.dataset.delWard;
        const id = btn.dataset.delId;
        if (contestants.wards[w]) delete contestants.wards[w][id];
        await saveToFirebase();
        renderModalContent();
        window.renderActiveWardContestantBanner();
      });
    });
  }

  function injectUI() {
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn && !document.getElementById('contestants-btn')) {
      syncBtn.insertAdjacentHTML('beforebegin',
        `<button id="contestants-btn" type="button" class="px-2 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition">Contestants</button>`);
    }

    if (!document.getElementById('contestants-modal')) {
      const wardOpts = Array.from({ length: 14 }, (_, i) => `<option value="${i + 1}">Ward ${i + 1}</option>`).join('');
      document.body.insertAdjacentHTML('beforeend', `
        <div id="contestants-modal" class="hidden fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
            <div class="px-4 py-3.5 bg-indigo-700 text-white flex items-center justify-between">
              <div>
                <h3 class="text-sm font-extrabold">Contestants &amp; Symbols</h3>
                <p class="text-[11px] text-indigo-100">Village President (Sarpanch) &amp; Wards 1–14</p>
              </div>
              <button id="close-contestants-modal" type="button" class="px-2.5 py-1 rounded-lg bg-white/15 text-xs font-bold">Close</button>
            </div>
            <div class="p-4 overflow-y-auto space-y-4">
              <div id="contestant-admin-form-wrap" class="hidden bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                <form id="add-contestant-form" class="space-y-2.5">
                  <h4 class="text-xs font-extrabold uppercase tracking-wide text-slate-700">Add Contestant (Admin)</h4>
                  <div class="grid grid-cols-2 gap-2">
                    <select id="c-role" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-bold">
                      <option value="president">Village President (Sarpanch)</option>
                      ${wardOpts}
                    </select>
                    <input id="c-name" type="text" required placeholder="Contestant Name" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                  </div>
                  <div class="grid grid-cols-3 gap-2">
                    <input id="c-symbol" type="text" required placeholder="Symbol Name (e.g. Ring)" class="col-span-2 px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                    <input id="c-icon" type="text" placeholder="Icon (e.g. 💍)" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <input id="c-phone" type="tel" placeholder="Phone Number (optional)" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                    <input id="c-party" type="text" placeholder="Panel / Group (optional)" class="px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
                  </div>
                  <button type="submit" class="w-full py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold">Save Contestant</button>
                </form>
              </div>
              <div class="space-y-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-amber-800">Village President (Sarpanch)</h4>
                <div id="contestants-president-list" class="space-y-1.5"></div>
              </div>
              <div class="space-y-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wide text-indigo-800">Ward Contestants (Wards 1–14)</h4>
                <div id="contestants-wards-list" class="space-y-2"></div>
              </div>
            </div>
          </div>
        </div>`);
    }
  }

  function init() {
    loadLocal();
    injectUI();
    document.getElementById('contestants-btn')?.addEventListener('click', () => {
      renderModalContent();
      document.getElementById('contestants-modal').classList.remove('hidden');
    });
    document.getElementById('close-contestants-modal')?.addEventListener('click', () => {
      document.getElementById('contestants-modal').classList.add('hidden');
    });
    document.getElementById('add-contestant-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isAdmin()) return;
      const role = document.getElementById('c-role').value;
      const name = document.getElementById('c-name').value.trim();
      const symbol = document.getElementById('c-symbol').value.trim();
      const symbolIcon = document.getElementById('c-icon').value.trim();
      const phone = document.getElementById('c-phone').value.trim();
      const party = document.getElementById('c-party').value.trim();
      if (!name || !symbol) return;
      const id = 'c_' + Date.now().toString(36);
      const rec = { name, symbol, symbolIcon, phone, party, _ts: Date.now() };
      if (role === 'president') {
        contestants.president[id] = rec;
      } else {
        const w = String(role);
        if (!contestants.wards[w]) contestants.wards[w] = {};
        contestants.wards[w][id] = { ...rec, ward: Number(w) };
      }
      await saveToFirebase();
      e.target.reset();
      renderModalContent();
      window.renderActiveWardContestantBanner();
      if (typeof showToast === 'function') showToast('Contestant saved to Firebase');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
