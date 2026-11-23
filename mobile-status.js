// mobile-status.js — Mobile Header Optimization + Deceased, Outside Country/City, & Election Day Auto Needed
(function () {
  'use strict';

  function optimizeMobileHeader() {
    const zp = document.getElementById('zone-pills');
    const wp = document.getElementById('ward-pills');
    if (zp && zp.parentElement) zp.parentElement.classList.add('hidden', 'sm:block');
    if (wp && wp.parentElement) wp.parentElement.classList.add('hidden', 'sm:block');

    if (!document.getElementById('mobile-selector-bar')) {
      const searchStrip = document.getElementById('search-input')?.closest('.bg-white');
      if (searchStrip) {
        searchStrip.insertAdjacentHTML('beforebegin', `
          <div id="mobile-selector-bar" class="sm:hidden bg-indigo-800/95 border-t border-indigo-600/40 px-2.5 py-1.5 flex items-center gap-1.5">
            <select id="mobile-zone-select" class="w-[43%] px-2 py-1.5 rounded-lg bg-amber-400 text-slate-900 text-xs font-extrabold focus:outline-none">
              <option value="all">All (5,655)</option>
              <option value="east">East (1–7)</option>
              <option value="west">West (8–14)</option>
            </select>
            <select id="mobile-ward-select" class="flex-1 px-2 py-1.5 rounded-lg bg-white text-indigo-900 text-xs font-bold focus:outline-none"></select>
          </div>`);
        document.getElementById('mobile-zone-select').addEventListener('change', (e) => {
          state.selectedZone = e.target.value;
          const allowed = getZoneWards(state.selectedZone);
          if (state.selectedWard !== 'all' && !allowed.includes(state.selectedWard)) state.selectedWard = 'all';
          state.pageLimit = 50;
          renderAll();
        });
        document.getElementById('mobile-ward-select').addEventListener('change', (e) => {
          state.selectedWard = e.target.value === 'all' ? 'all' : Number(e.target.value);
          state.pageLimit = 50;
          renderAll();
        });
      }
    }

    const searchBox = document.getElementById('search-input')?.closest('.space-y-2');
    if (searchBox && !document.getElementById('quick-status-pills')) {
      searchBox.insertAdjacentHTML('beforeend', `
        <div id="quick-status-pills" class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 text-[11px]">
          <button type="button" data-qf="" class="qf-btn shrink-0 px-2.5 py-1 rounded-full font-bold bg-indigo-700 text-white">All</button>
          <button type="button" data-qf="auto" class="qf-btn shrink-0 px-2.5 py-1 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200">Auto Needed</button>
          <button type="button" data-qf="outside_country" class="qf-btn shrink-0 px-2.5 py-1 rounded-full font-bold bg-violet-50 text-violet-800 border border-violet-200">Outside Country</button>
          <button type="button" data-qf="outside_village" class="qf-btn shrink-0 px-2.5 py-1 rounded-full font-bold bg-sky-50 text-sky-800 border border-sky-200">Outside Village</button>
          <button type="button" data-qf="deceased" class="qf-btn shrink-0 px-2.5 py-1 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-300">Deceased</button>
          <button type="button" id="open-contestants-btn" class="shrink-0 px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 ml-auto">Contestants</button>
        </div>`);
      document.querySelectorAll('.qf-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          window._quickFilter = btn.dataset.qf || '';
          document.querySelectorAll('.qf-btn').forEach(b => {
            const on = (b.dataset.qf || '') === window._quickFilter;
            b.classList.toggle('ring-2', on);
            b.classList.toggle('ring-indigo-500', on);
          });
          state.pageLimit = 50;
          renderAll();
        });
      });
      document.getElementById('open-contestants-btn')?.addEventListener('click', () => {
        if (typeof window.openContestantsModal === 'function') window.openContestantsModal();
      });
    }
  }

  function syncMobileSelectors() {
    const zSel = document.getElementById('mobile-zone-select');
    const wSel = document.getElementById('mobile-ward-select');
    if (!zSel || !wSel) return;
    zSel.value = state.selectedZone;
    const wards = getZoneWards(state.selectedZone);
    const zVoters = getZoneVoters(state.selectedZone);
    const zDone = zVoters.filter(v => getCamp(v.gp).delivered).length;
    const lbl = state.selectedZone === 'east' ? 'All East' : state.selectedZone === 'west' ? 'All West' : 'All Wards';
    const opts = [`<option value="all">${lbl} (${zDone}/${zVoters.length})</option>`];
    for (const w of wards) {
      const wv = state.voters.filter(v => v.ward === w);
      const wd = wv.filter(v => getCamp(v.gp).delivered).length;
      opts.push(`<option value="${w}">Ward ${w} (${wd}/${wv.length})</option>`);
    }
    wSel.innerHTML = opts.join('');
    wSel.value = String(state.selectedWard);
  }

  const origOpenSlipModal = window.openSlipModal;
  window.openSlipModal = function (gp) {
    if (typeof origOpenSlipModal === 'function') origOpenSlipModal(gp);
    const body = document.getElementById('slip-modal-body');
    const v = state.voters.find(x => x.gp === gp);
    if (!body || !v) return;
    const c = getCamp(v.gp);
    const isOut = c.location === 'outside' || c.location === 'outside_country';

    body.insertAdjacentHTML('beforeend', `
      <div id="ext-voter-controls" class="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
        <div class="font-extrabold text-slate-800 uppercase tracking-wide text-[11px]">Special Status &amp; Election Day Logistics</div>
        <label class="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer">
          <span class="font-bold text-slate-800">Mark as Deceased (మరణించారు)</span>
          <input id="ext-deceased" type="checkbox" ${c.deceased ? 'checked' : ''} class="w-4 h-4 accent-slate-800" />
        </label>
        <div class="space-y-1.5">
          <div class="font-bold text-slate-700">Location &amp; City / Country</div>
          <div class="grid grid-cols-3 gap-1.5">
            <button type="button" data-ext-loc="in_village" class="ext-loc-btn py-1.5 px-2 rounded-lg font-bold border text-[11px] ${c.location === 'in_village' ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-700 border-slate-300'}">In Village</button>
            <button type="button" data-ext-loc="outside" class="ext-loc-btn py-1.5 px-2 rounded-lg font-bold border text-[11px] ${c.location === 'outside' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700 border-slate-300'}">Outside Village</button>
            <button type="button" data-ext-loc="outside_country" class="ext-loc-btn py-1.5 px-2 rounded-lg font-bold border text-[11px] ${c.location === 'outside_country' ? 'bg-violet-700 text-white border-violet-700' : 'bg-white text-slate-700 border-slate-300'}">Outside Country</button>
          </div>
          <div id="ext-city-wrap" class="${isOut ? '' : 'hidden'} pt-1">
            <input id="ext-city" type="text" value="${(c.city || '').replace(/"/g, '&quot;')}" placeholder="City / Country name (e.g. Hyderabad, USA, Dubai)"
              class="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div class="space-y-1.5 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
          <label class="flex items-center justify-between gap-2 cursor-pointer">
            <span class="font-bold text-amber-950">Auto Needed on Election Day (Elderly / ఆటో)</span>
            <input id="ext-auto" type="checkbox" ${c.autoNeeded ? 'checked' : ''} class="w-4 h-4 accent-amber-600" />
          </label>
          <input id="ext-auto-note" type="text" value="${(c.autoNote || '').replace(/"/g, '&quot;')}" placeholder="Pickup note / time / landmark (optional)"
            class="${c.autoNeeded ? '' : 'hidden'} w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-300 bg-white" />
        </div>
      </div>`);

    document.getElementById('ext-deceased')?.addEventListener('change', (e) => { setCamp(gp, { deceased: e.target.checked }); renderAll(); });
    document.querySelectorAll('.ext-loc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const loc = btn.dataset.extLoc;
        setCamp(gp, { location: loc });
        document.getElementById('ext-city-wrap')?.classList.toggle('hidden', loc === 'in_village');
        renderAll();
      });
    });
    document.getElementById('ext-city')?.addEventListener('input', (e) => setCamp(gp, { city: e.target.value }));
    document.getElementById('ext-auto')?.addEventListener('change', (e) => {
      setCamp(gp, { autoNeeded: e.target.checked });
      document.getElementById('ext-auto-note')?.classList.toggle('hidden', !e.target.checked);
      renderAll();
    });
    document.getElementById('ext-auto-note')?.addEventListener('input', (e) => setCamp(gp, { autoNote: e.target.value }));
  };

  const origRenderVoterRow = window.renderVoterRow;
  if (typeof origRenderVoterRow === 'function') {
    window.renderVoterRow = function (v) {
      let html = origRenderVoterRow(v);
      const c = getCamp(v.gp);
      const badges = [];
      if (c.deceased) badges.push('<span class="px-1.5 py-0.5 rounded bg-slate-800 text-white text-[10px] font-bold">Deceased</span>');
      if (c.location === 'outside_country') badges.push(`<span class="px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 text-[10px] font-bold">Abroad${c.city ? ': ' + c.city : ''}</span>`);
      else if (c.location === 'outside' && c.city) badges.push(`<span class="px-1.5 py-0.5 rounded bg-sky-50 text-sky-900 border border-sky-200 text-[10px] font-bold">${c.city}</span>`);
      if (c.autoNeeded) badges.push('<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">Auto Needed</span>');
      if (badges.length) html = html.replace('</div>\n            <div class="text-sm font-bold', badges.join(' ') + '</div>\n            <div class="text-sm font-bold');
      return html;
    };
  }

  const origRenderAll = window.renderAll;
  window.renderAll = function () {
    if (typeof origRenderAll === 'function') origRenderAll();
    optimizeMobileHeader();
    syncMobileSelectors();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { optimizeMobileHeader(); syncMobileSelectors(); });
  else { optimizeMobileHeader(); syncMobileSelectors(); }
})();
