// contestants.js — Village President & Ward 1-14 Contestants + Symbols + Firebase Full Voter Sync
(function () {
  'use strict';

  const CONTESTANTS_KEY = 'dronadula_contestants_v1';
  let contestants = { president: [], wards: {} };

  function loadContestants() {
    try {
      const raw = localStorage.getItem(CONTESTANTS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        contestants = { president: Array.isArray(p.president) ? p.president : [], wards: p.wards || {} };
      }
    } catch (e) {}
  }

  function saveContestants() {
    try { localStorage.setItem(CONTESTANTS_KEY, JSON.stringify(contestants)); } catch (e) {}
    if (typeof fbConfig !== 'undefined' && fbConfig.url) {
      const base = cleanFbUrl(fbConfig.url);
      const room = encodeURIComponent(fbConfig.room || DEFAULT_ROOM);
      fetch(`${base}/rooms/${room}/contestants.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contestants)
      }).catch(() => {});
    }
  }

  window.uploadAllVotersToFirebase = async function () {
    const statusEl = document.getElementById('fb-upload-status');
    if (typeof fbConfig === 'undefined' || !fbConfig.url) {
      if (statusEl) statusEl.textContent = 'Connect your Firebase URL in Sync first.';
      return;
    }
    const base = cleanFbUrl(fbConfig.url);
    const room = encodeURIComponent(fbConfig.room || DEFAULT_ROOM);
    const total = state.voters.length;
    try {
      for (let i = 0; i < total; i += 400) {
        const batch = {};
        for (const v of state.voters.slice(i, i + 400)) {
          batch[v.gp] = { gp: v.gp, ward: v.ward, asm: v.asm, name: v.name, relType: v.relType, relName: v.relName, age: v.age, gender: v.gender, house: v.house, epic: v.epic, status: getCamp(v.gp) };
        }
        if (statusEl) statusEl.textContent = `Uploading ${i + 1}-${Math.min(i + 400, total)} of ${total}...`;
        const r = await fetch(`${base}/rooms/${room}/votersRegistry.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
      }
      if (Object.keys(state.campaign).length > 0) {
        await fetch(`${base}/rooms/${room}/campaign.json`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.campaign) });
      }
      saveContestants();
      if (statusEl) statusEl.textContent = `Synced all ${total.toLocaleString()} voters & statuses to Firebase!`;
    } catch (e) {
      if (statusEl) statusEl.textContent = 'Upload failed: ' + e.message;
    }
  };

  function ensureModal() {
    if (document.getElementById('contestants-modal')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div id="contestants-modal" class="hidden fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div class="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
          <div class="px-4 py-3.5 bg-emerald-700 text-white flex items-center justify-between">
            <div>
              <h3 class="text-sm font-extrabold">Contestants &amp; Symbols (అభ్యర్థులు)</h3>
              <p class="text-[11px] text-emerald-100">Village President (Sarpanch) &amp; Ward 1–14 Contestants</p>
            </div>
            <button id="close-contestants-modal" type="button" class="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-bold">Close</button>
          </div>
          <div class="p-4 overflow-y-auto space-y-4">
            <form id="add-contestant-form" class="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5 text-xs">
              <div class="font-extrabold text-slate-700 uppercase">Add Contestant</div>
              <div class="grid grid-cols-2 gap-2">
                <select id="cont-scope" class="px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-bold">
                  <option value="president">Village President (Sarpanch)</option>
                  ${Array.from({ length: 14 }, (_, i) => `<option value="ward:${i + 1}">Ward ${i + 1} Contestant</option>`).join('')}
                </select>
                <input id="cont-name" type="text" required placeholder="Contestant Name" class="px-2.5 py-2 rounded-xl border border-slate-300 bg-white" />
              </div>
              <div class="grid grid-cols-3 gap-2">
                <input id="cont-symbol-name" type="text" required placeholder="Symbol Name (e.g. Ring)" class="col-span-2 px-2.5 py-2 rounded-xl border border-slate-300 bg-white" />
                <input id="cont-symbol-icon" type="text" placeholder="Icon" class="px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-center" />
              </div>
              <button type="submit" class="w-full py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold">Save Contestant</button>
            </form>
            <div id="contestants-list" class="space-y-3 text-xs"></div>
          </div>
        </div>
      </div>`);
    document.getElementById('close-contestants-modal')?.addEventListener('click', () => document.getElementById('contestants-modal').classList.add('hidden'));
    document.getElementById('add-contestant-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const scope = document.getElementById('cont-scope').value;
      const name = document.getElementById('cont-name').value.trim();
      const symbolName = document.getElementById('cont-symbol-name').value.trim();
      const symbolIcon = document.getElementById('cont-symbol-icon').value.trim() || '*';
      if (!name || !symbolName) return;
      const item = { id: 'c_' + Date.now(), name, symbolName, symbolIcon };
      if (scope === 'president') contestants.president.push(item);
      else { const w = scope.split(':')[1]; if (!contestants.wards[w]) contestants.wards[w] = []; contestants.wards[w].push(item); }
      saveContestants(); e.target.reset(); renderList(); renderStrip();
    });
  }

  function renderList() {
    const el = document.getElementById('contestants-list');
    if (!el) return;
    let html = `<div class="space-y-1.5"><div class="font-extrabold text-emerald-800 uppercase text-[11px]">Village President (Sarpanch)</div>`;
    html += contestants.president.length
      ? contestants.president.map(c => `<div class="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-xl"><div><b>${c.symbolIcon} ${c.name}</b> — ${c.symbolName}</div><button type="button" data-dp="${c.id}" class="px-2 py-1 rounded bg-rose-50 text-rose-700 font-bold">Remove</button></div>`).join('')
      : '<div class="text-slate-500 p-2 bg-slate-50 rounded-xl border">None added yet.</div>';
    html += `</div><div class="space-y-1.5"><div class="font-extrabold text-indigo-800 uppercase text-[11px]">Ward Contestants (1–14)</div>`;
    const wks = Object.keys(contestants.wards).filter(w => (contestants.wards[w] || []).length).sort((a, b) => Number(a) - Number(b));
    html += wks.length
      ? wks.map(w => `<div class="font-bold text-slate-700 pt-1">Ward ${w}</div>` + contestants.wards[w].map(c => `<div class="flex items-center justify-between p-2 bg-white border rounded-xl"><div><b>${c.symbolIcon} ${c.name}</b> — ${c.symbolName}</div><button type="button" data-dw="${w}" data-dc="${c.id}" class="px-2 py-1 rounded bg-rose-50 text-rose-700 font-bold">Remove</button></div>`).join('')).join('')
      : '<div class="text-slate-500 p-2 bg-slate-50 rounded-xl border">None added yet.</div>';
    el.innerHTML = html + '</div>';
    el.querySelectorAll('[data-dp]').forEach(b => b.addEventListener('click', () => { contestants.president = contestants.president.filter(x => x.id !== b.dataset.dp); saveContestants(); renderList(); renderStrip(); }));
    el.querySelectorAll('[data-dw]').forEach(b => b.addEventListener('click', () => { const w = b.dataset.dw; contestants.wards[w] = (contestants.wards[w] || []).filter(x => x.id !== b.dataset.dc); saveContestants(); renderList(); renderStrip(); }));
  }

  function renderStrip() {
    const main = document.getElementById('main-content');
    if (!main) return;
    let strip = document.getElementById('contestants-strip');
    if (!strip) { strip = document.createElement('div'); strip.id = 'contestants-strip'; strip.className = 'mb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px]'; main.parentElement.insertBefore(strip, main); }
    const wConts = state.selectedWard !== 'all' ? (contestants.wards[String(state.selectedWard)] || []) : [];
    const items = [...contestants.president.map(c => ({ ...c, tag: 'President' })), ...wConts.map(c => ({ ...c, tag: 'W' + state.selectedWard }))];
    strip.classList.toggle('hidden', !items.length);
    strip.innerHTML = items.map(c => `<span class="shrink-0 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">${c.symbolIcon} ${c.name} (${c.symbolName} · ${c.tag})</span>`).join('');
  }

  window.openContestantsModal = function () { ensureModal(); renderList(); document.getElementById('contestants-modal').classList.remove('hidden'); };

  const origRenderAll = window.renderAll;
  window.renderAll = function () { if (typeof origRenderAll === 'function') origRenderAll(); renderStrip(); };

  loadContestants();
  if (typeof window.AUTO_FIREBASE_URL === 'string' && window.AUTO_FIREBASE_URL.trim() && typeof fbConfig !== 'undefined') {
    fbConfig.url = window.AUTO_FIREBASE_URL.trim();
    if (typeof startLiveSync === 'function') startLiveSync();
  }
})();
