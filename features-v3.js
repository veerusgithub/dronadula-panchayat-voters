// features-v3.js (v4) — Auto Firebase Sync, Audit Log, Voter Phone, Bus/Auto Needed + Dashboard Counts/Filters,
// Deceased, Outside Country + City, Compact Mobile Ward Selector & Ward Visibility Masking
(function () {
  'use strict';

  const FIREBASE_DEFAULT_URL = 'https://voter-list-17964-default-rtdb.firebaseio.com';
  const FIREBASE_DEFAULT_ROOM = 'dronadula_main';
  const FB_CFG_BACKUP_KEY = 'dronadula_fb_cfg_v1';

  if (typeof state !== 'undefined' && !state.fSpecial) state.fSpecial = 'all';

  function initFirebaseConfig() {
    if (typeof fbConfig === 'undefined') return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(FB_CFG_BACKUP_KEY) || 'null'); } catch (e) {}
    if (!fbConfig.url) fbConfig.url = (saved && saved.url) || FIREBASE_DEFAULT_URL;
    if (!fbConfig.room) fbConfig.room = (saved && saved.room) || FIREBASE_DEFAULT_ROOM;
    try { localStorage.setItem(FB_CFG_BACKUP_KEY, JSON.stringify({ url: fbConfig.url, room: fbConfig.room })); } catch (e) {}
  }

  function getActor() {
    const s = typeof window.getCurrentAuthSession === 'function' ? window.getCurrentAuthSession() : null;
    return { user: (s && s.username) || 'unknown', userName: (s && s.name) || 'Unknown' };
  }

  const origGetCamp = window.getCamp;
  window.getCamp = function (gp) {
    const base = typeof origGetCamp === 'function' ? origGetCamp(gp) : (state.campaign[gp] || {});
    const loc = base.location === 'outside' ? 'outside_village' : (base.location || 'in_village');
    return {
      delivered: false, phone: false, person: false,
      support: 'unknown', wish: '',
      ticket: 'none', city: '', unit: '',
      deceased: false,
      autoNeeded: false, autoNote: '',
      busNeeded: false, busNote: '',
      voterPhone: '',
      ...base,
      location: loc
    };
  };

  async function appendAuditLog(gp, patch) {
    if (!fbConfig || !fbConfig.url) return;
    try {
      const actor = getActor();
      const v = (state.voters || []).find(x => x.gp === Number(gp));
      const base = cleanFbUrl(fbConfig.url);
      const room = encodeURIComponent(fbConfig.room || FIREBASE_DEFAULT_ROOM);
      const keys = Object.keys(patch || {}).filter(k => !k.startsWith('_') && k !== 'updatedBy' && k !== 'updatedByName' && k !== 'updatedAt');
      await fetch(`${base}/rooms/${room}/auditLog.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gp: Number(gp), ward: v ? v.ward : 0, user: actor.user, userName: actor.userName, fields: keys.join(','), ts: Date.now() })
      });
    } catch (e) {}
  }

  window.setCamp = function (gp, patch) {
    const v = (state.voters || []).find(x => x.gp === Number(gp));
    if (v && typeof window.canAccessCampaignForWard === 'function' && !window.canAccessCampaignForWard(v.ward)) {
      if (typeof showToast === 'function') showToast('Read-only ward: you can edit only your assigned ward.');
      return;
    }
    const actor = getActor();
    const now = Date.now();
    const updated = { ...window.getCamp(gp), ...patch, _ts: now, updatedAt: now, updatedBy: actor.user, updatedByName: actor.userName };
    state.campaign[gp] = updated;
    if (typeof saveState === 'function') saveState();
    window.pushVoterToFirebase(gp, updated);
    appendAuditLog(gp, patch);
  };

  window.pushVoterToFirebase = async function (gp, record) {
    if (!fbConfig || !fbConfig.url) return;
    try {
      const base = cleanFbUrl(fbConfig.url);
      const room = encodeURIComponent(fbConfig.room || FIREBASE_DEFAULT_ROOM);
      await fetch(`${base}/rooms/${room}/campaign/${gp}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (typeof updateSyncIndicator === 'function') updateSyncIndicator(true);
    } catch (e) {
      if (typeof updateSyncIndicator === 'function') updateSyncIndicator(false);
    }
  };

  window.pullFromFirebase = async function (forcePushLocal = true) {
    initFirebaseConfig();
    if (!fbConfig || !fbConfig.url) return;
    try {
      const base = cleanFbUrl(fbConfig.url);
      const room = encodeURIComponent(fbConfig.room || FIREBASE_DEFAULT_ROOM);
      const res = await fetch(`${base}/rooms/${room}.json`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = (await res.json()) || {};

      if (data.auth && typeof window._mergeRemoteAuth === 'function') window._mergeRemoteAuth(data.auth);
      if (data.contestants && typeof window._mergeRemoteContestants === 'function') window._mergeRemoteContestants(data.contestants);

      const remoteCamp = data.campaign || {};
      const localCamp = state.campaign || {};
      const toPush = {};
      let pulledCount = 0, pushedCount = 0;

      for (const [gp, rec] of Object.entries(remoteCamp)) {
        if (!rec || typeof rec !== 'object') continue;
        const loc = localCamp[gp];
        if (!loc || (rec._ts || 0) >= (loc._ts || 0)) {
          localCamp[gp] = rec;
          pulledCount++;
        }
      }

      if (forcePushLocal) {
        const actor = getActor();
        for (const [gp, loc] of Object.entries(localCamp)) {
          if (!loc || typeof loc !== 'object') continue;
          const rem = remoteCamp[gp];
          const isMeaningful = loc.delivered || loc.phone || loc.person || loc.deceased || loc.autoNeeded || loc.busNeeded ||
            (loc.voterPhone && loc.voterPhone.trim()) ||
            (loc.support && loc.support !== 'unknown') || (loc.wish && loc.wish.trim()) ||
            (loc.location && loc.location !== 'in_village') || (loc.city && loc.city.trim());
          if (!isMeaningful) continue;
          if (!rem || (loc._ts || 1) > (rem._ts || 0)) {
            const stamped = { ...loc, _ts: loc._ts || Date.now(), updatedBy: loc.updatedBy || actor.user, updatedByName: loc.updatedByName || actor.userName };
            localCamp[gp] = stamped;
            toPush[gp] = stamped;
            pushedCount++;
          }
        }
      }

      if (data.mergedHouses) state.mergedHouses = { ...state.mergedHouses, ...data.mergedHouses };
      if (data.dismissedCombos) state.dismissedCombos = { ...state.dismissedCombos, ...data.dismissedCombos };
      if (data.dupDecisions) state.dupDecisions = { ...state.dupDecisions, ...data.dupDecisions };

      state.campaign = localCamp;
      if (typeof saveState === 'function') saveState();

      if (pushedCount > 0) {
        await fetch(`${base}/rooms/${room}/campaign.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(toPush)
        });
      }

      if (typeof updateSyncIndicator === 'function') updateSyncIndicator(true);
      if (typeof renderAll === 'function') renderAll();
      return { pulledCount, pushedCount };
    } catch (e) {
      if (typeof updateSyncIndicator === 'function') updateSyncIndicator(false);
      return null;
    }
  };

  window.seedAllVotersToFirebase = async function (statusCallback) {
    initFirebaseConfig();
    if (!fbConfig || !fbConfig.url) return;
    const base = cleanFbUrl(fbConfig.url);
    const room = encodeURIComponent(fbConfig.room || FIREBASE_DEFAULT_ROOM);
    const voters = state.voters || [];
    const batchSize = 500;
    for (let i = 0; i < voters.length; i += batchSize) {
      const chunk = {};
      for (const v of voters.slice(i, i + batchSize)) {
        chunk[v.gp] = { gp: v.gp, ward: v.ward, asm: v.asm, name: v.name, relType: v.relType, relName: v.relName, age: v.age, gender: v.gender, house: v.house, epic: v.epic };
      }
      await fetch(`${base}/rooms/${room}/voters.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk)
      });
      if (statusCallback) statusCallback(Math.min(i + batchSize, voters.length), voters.length);
    }
    await window.pullFromFirebase(true);
  };

  window.canAccessCampaignForWard = function (ward) {
    const s = typeof window.getCurrentAuthSession === 'function' ? window.getCurrentAuthSession() : null;
    if (!s) return false;
    if (s.role === 'admin') return true;
    const sc = s.scope || '';
    if (sc === 'all') return true;
    if (sc === 'east') return ward >= 1 && ward <= 7;
    if (sc === 'west') return ward >= 8 && ward <= 14;
    if (sc.startsWith('ward:')) return Number(sc.split(':')[1]) === Number(ward);
    return false;
  };

  function jumpToSpecialFilter(filterVal) {
    state.fSpecial = state.fSpecial === filterVal ? 'all' : filterVal;
    state.pageLimit = 50;
    if (state.fSpecial !== 'all' && state.activeTab === 'dashboard') {
      state.activeTab = 'families';
    }
    renderAll();
  }

  function injectCompactMobileCSS() {
    if (document.getElementById('compact-mobile-style')) return;
    const style = document.createElement('style');
    style.id = 'compact-mobile-style';
    style.textContent = `
      @media (max-width: 768px) {
        header.sticky { position: sticky; top: 0; }
        #zone-pills { padding-top: 4px !important; padding-bottom: 4px !important; }
        #ward-pills { display: none !important; }
        #compact-ward-bar { display: flex !important; }
      }
      @media (min-width: 769px) {
        #compact-ward-bar { display: flex !important; }
        #ward-pills { display: flex !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderCompactWardBar() {
    const wardStrip = document.getElementById('ward-pills');
    if (!wardStrip) return;
    let bar = document.getElementById('compact-ward-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'compact-ward-bar';
      bar.className = 'max-w-4xl mx-auto px-3 py-1.5 flex items-center gap-1.5 text-xs';
      wardStrip.parentElement.insertBefore(bar, wardStrip);
    }

    const wards = typeof getZoneWards === 'function' ? getZoneWards(state.selectedZone) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14];
    const zoneVoters = typeof getZoneVoters === 'function' ? getZoneVoters(state.selectedZone) : state.voters;
    const isTe = state.lang === 'te';

    const opts = [`<option value="all">${isTe ? 'అన్ని వార్డులు' : 'All Wards'} (${zoneVoters.length})</option>`];
    for (const w of wards) {
      const wv = state.voters.filter(v => v.ward === w);
      const canSee = window.canAccessCampaignForWard(w);
      const done = canSee ? wv.filter(v => window.getCamp(v.gp).delivered).length : null;
      const suffix = canSee ? ` · ${done}/${wv.length}` : ` · ${wv.length}`;
      opts.push(`<option value="${w}" ${state.selectedWard === w ? 'selected' : ''}>${isTe ? 'వార్డు' : 'Ward'} ${w}${suffix}</option>`);
    }

    const s = typeof window.getCurrentAuthSession === 'function' ? window.getCurrentAuthSession() : null;
    const assignedHint = (s && s.role !== 'admin' && s.scope && s.scope.startsWith('ward:'))
      ? `<button id="jump-my-ward" type="button" class="shrink-0 px-2 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[11px]">W${s.scope.split(':')[1]}</button>`
      : '';

    bar.innerHTML = `
      <select id="compact-ward-select" class="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-white text-slate-900 font-bold text-xs border border-indigo-300 focus:outline-none">${opts.join('')}</select>
      ${assignedHint}
      <button id="quick-bus-filter" type="button" class="shrink-0 px-2 py-1.5 rounded-lg text-[11px] font-bold transition ${state.fSpecial === 'bus_needed' ? 'bg-cyan-400 text-slate-900' : 'bg-white/15 text-indigo-100 hover:bg-white/25'}">Bus</button>
      <button id="quick-auto-filter" type="button" class="shrink-0 px-2 py-1.5 rounded-lg text-[11px] font-bold transition ${state.fSpecial === 'auto_needed' ? 'bg-amber-400 text-slate-900' : 'bg-white/15 text-indigo-100 hover:bg-white/25'}">Auto</button>
      <button id="quick-deceased-filter" type="button" class="shrink-0 px-2 py-1.5 rounded-lg text-[11px] font-bold transition ${state.fSpecial === 'deceased' ? 'bg-rose-400 text-slate-900' : 'bg-white/15 text-indigo-100 hover:bg-white/25'}">Deceased</button>`;

    bar.querySelector('#compact-ward-select').addEventListener('change', (e) => {
      state.selectedWard = e.target.value === 'all' ? 'all' : Number(e.target.value);
      state.pageLimit = 50; renderAll();
    });
    bar.querySelector('#jump-my-ward')?.addEventListener('click', () => {
      const w = Number(s.scope.split(':')[1]);
      state.selectedZone = w <= 7 ? 'east' : 'west'; state.selectedWard = w; state.pageLimit = 50; renderAll();
    });
    bar.querySelector('#quick-bus-filter')?.addEventListener('click', () => jumpToSpecialFilter('bus_needed'));
    bar.querySelector('#quick-auto-filter')?.addEventListener('click', () => jumpToSpecialFilter('auto_needed'));
    bar.querySelector('#quick-deceased-filter')?.addEventListener('click', () => jumpToSpecialFilter('deceased'));
  }

  const origRenderVoterRow = window.renderVoterRow;
  window.renderVoterRow = function (v) {
    if (!window.canAccessCampaignForWard(v.ward)) {
      const photo = typeof photoTag === 'function' ? photoTag(v.gp) : '';
      return `
        <div class="voter-row flex items-center gap-3 p-3 bg-white hover:bg-slate-50 transition cursor-pointer" data-gp="${v.gp}">
          ${photo}
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">#${v.gp}</span>
              <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">W${v.ward}</span>
              <span class="text-sm font-bold text-slate-900 truncate">${v.name || ''}</span>
            </div>
            <div class="text-xs text-slate-600 truncate mt-0.5">${v.relType ? v.relType + ': ' : ''}${v.relName || ''}</div>
            <div class="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
              <span>${v.age || '-'}y · ${v.gender || '-'}</span>
              <span>H.No: <b>${v.house || '-'}</b></span>
              <span class="font-mono text-[10px]">${v.epic || ''}</span>
            </div>
          </div>
          <span class="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Read-only</span>
        </div>`;
    }

    let html = typeof origRenderVoterRow === 'function' ? origRenderVoterRow(v) : '';
    const c = window.getCamp(v.gp);
    const badges = [];
    if (c.voterPhone) badges.push(`<a href="tel:${c.voterPhone.replace(/[^0-9+]/g, '')}" onclick="event.stopPropagation()" class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200">📞 ${c.voterPhone}</a>`);
    if (c.busNeeded) badges.push('<span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-900 border border-cyan-300">Bus Needed</span>');
    if (c.autoNeeded) badges.push('<span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">Auto Needed</span>');
    if (c.deceased) badges.push('<span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">Deceased</span>');
    if (c.location === 'outside_country') badges.push(`<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">Outside Country${c.city ? ': ' + c.city : ''}</span>`);
    else if (c.location === 'outside_village' && c.city) badges.push(`<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">Outside: ${c.city}</span>`);

    if (badges.length && html) {
      const idx = html.lastIndexOf('</div>');
      if (idx > 0) html = html.slice(0, idx) + `<div class="flex flex-wrap gap-1 mt-1">${badges.join('')}</div>` + html.slice(idx);
    }
    return html;
  };

  const origOpenSlipModal = window.openSlipModal;
  window.openSlipModal = function (gp) {
    const v = (state.voters || []).find(x => x.gp === Number(gp));
    if (!v) return;

    if (!window.canAccessCampaignForWard(v.ward)) {
      let ro = document.getElementById('readonly-voter-modal');
      if (!ro) {
        document.body.insertAdjacentHTML('beforeend', `
          <div id="readonly-voter-modal" class="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div class="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
              <div class="px-4 py-3 bg-slate-800 text-white flex items-center justify-between">
                <h3 class="text-sm font-bold">Voter Info (Read-Only Ward)</h3>
                <button id="close-ro-modal" type="button" class="px-2.5 py-1 rounded-lg bg-white/15 text-xs font-bold">Close</button>
              </div>
              <div id="ro-modal-body" class="p-4"></div>
            </div>
          </div>`);
        document.getElementById('close-ro-modal').addEventListener('click', () => document.getElementById('readonly-voter-modal').classList.add('hidden'));
        ro = document.getElementById('readonly-voter-modal');
      }
      const photo = typeof photoTag === 'function' ? photoTag(v.gp, 'w-16 h-20 rounded-xl object-cover border border-slate-200') : '';
      document.getElementById('ro-modal-body').innerHTML = `
        <div class="flex gap-3 items-start">
          ${photo}
          <div class="space-y-1 text-xs">
            <div class="text-base font-extrabold text-slate-900">${v.name}</div>
            <div class="text-slate-600">${v.relType || 'Relation'}: <b>${v.relName || '-'}</b></div>
            <div class="text-slate-600">Ward <b>${v.ward}</b> · GP <b>#${v.gp}</b> · ASM <b>${v.asm || '-'}</b></div>
            <div class="text-slate-600">House: <b>${v.house || '-'}</b> · Age/Gender: <b>${v.age || '-'} / ${v.gender || '-'}</b></div>
            <div class="text-slate-600">EPIC: <span class="font-mono font-bold">${v.epic || '-'}</span></div>
          </div>
        </div>
        <div class="mt-4 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
          Campaign details (support, phone, transport, notes) for Ward ${v.ward} are restricted to Admin and Ward ${v.ward} members.
        </div>`;
      ro.classList.remove('hidden');
      return;
    }

    if (typeof origOpenSlipModal === 'function') origOpenSlipModal(gp);

    setTimeout(() => {
      const modal = document.getElementById('slip-modal');
      if (!modal) return;
      const body = modal.querySelector('#slip-modal-body') || modal.querySelector('.overflow-y-auto') || modal;
      const existing = modal.querySelector('#v3-extra-fields');
      if (existing) existing.remove();

      const c = window.getCamp(v.gp);
      const locVal = c.location || 'in_village';
      const showCity = locVal === 'outside_village' || locVal === 'outside_country';
      const auditLine = c.updatedBy
        ? `<div class="text-[10px] text-slate-500 pt-1">Last updated by <b>@${c.updatedBy}</b>${c.updatedAt ? ' · ' + new Date(c.updatedAt).toLocaleString() : ''}</div>`
        : '';

      const panel = document.createElement('div');
      panel.id = 'v3-extra-fields';
      panel.className = 'mt-3 p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-3';
      panel.innerHTML = `
        <div class="text-xs font-extrabold uppercase tracking-wide text-indigo-800">Phone, Status &amp; Election-Day Transport</div>
        <div>
          <label class="block text-[11px] font-bold text-slate-700 mb-1">Voter Phone Number</label>
          <div class="flex gap-2">
            <input id="v3-voter-phone" type="tel" value="${(c.voterPhone || '').replace(/"/g, '&quot;')}" placeholder="Enter 10-digit mobile number"
              class="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
            ${c.voterPhone ? `<a href="tel:${c.voterPhone.replace(/[^0-9+]/g, '')}" class="shrink-0 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Call</a>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-3 gap-1.5">
          <label class="flex items-center gap-1.5 p-2 rounded-xl bg-white border ${c.busNeeded ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200'} cursor-pointer text-[11px] font-bold">
            <input id="v3-bus" type="checkbox" ${c.busNeeded ? 'checked' : ''} class="w-4 h-4 accent-cyan-600" />
            <span>Bus Needed</span>
          </label>
          <label class="flex items-center gap-1.5 p-2 rounded-xl bg-white border ${c.autoNeeded ? 'border-amber-400 bg-amber-50' : 'border-slate-200'} cursor-pointer text-[11px] font-bold">
            <input id="v3-auto" type="checkbox" ${c.autoNeeded ? 'checked' : ''} class="w-4 h-4 accent-amber-600" />
            <span>Auto Needed</span>
          </label>
          <label class="flex items-center gap-1.5 p-2 rounded-xl bg-white border ${c.deceased ? 'border-rose-400 bg-rose-50' : 'border-slate-200'} cursor-pointer text-[11px] font-bold">
            <input id="v3-deceased" type="checkbox" ${c.deceased ? 'checked' : ''} class="w-4 h-4 accent-rose-600" />
            <span>Deceased</span>
          </label>
        </div>
        <div id="v3-bus-note-wrap" class="${c.busNeeded ? '' : 'hidden'}">
          <label class="block text-[11px] font-bold text-cyan-900 mb-1">Bus Route / Pickup Note</label>
          <input id="v3-bus-note" type="text" value="${(c.busNote || '').replace(/"/g, '&quot;')}" placeholder="e.g. From Hyderabad KPHB / Guntur Bus Stand"
            class="w-full px-3 py-2 text-xs rounded-xl border border-cyan-300 bg-white" />
        </div>
        <div id="v3-auto-note-wrap" class="${c.autoNeeded ? '' : 'hidden'}">
          <label class="block text-[11px] font-bold text-amber-900 mb-1">Auto Pickup Note / Landmark</label>
          <input id="v3-auto-note" type="text" value="${(c.autoNote || '').replace(/"/g, '&quot;')}" placeholder="e.g. Elderly, pick up at 8 AM near temple"
            class="w-full px-3 py-2 text-xs rounded-xl border border-amber-300 bg-white" />
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-700 mb-1">Voter Location</label>
          <div class="grid grid-cols-3 gap-1.5">
            <button type="button" data-v3-loc="in_village" class="v3-loc-btn py-2 px-2 rounded-xl text-[11px] font-bold border ${locVal === 'in_village' ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-700 border-slate-200'}">In Village</button>
            <button type="button" data-v3-loc="outside_village" class="v3-loc-btn py-2 px-2 rounded-xl text-[11px] font-bold border ${locVal === 'outside_village' ? 'bg-sky-700 text-white border-sky-700' : 'bg-white text-slate-700 border-slate-200'}">Outside Village</button>
            <button type="button" data-v3-loc="outside_country" class="v3-loc-btn py-2 px-2 rounded-xl text-[11px] font-bold border ${locVal === 'outside_country' ? 'bg-purple-700 text-white border-purple-700' : 'bg-white text-slate-700 border-slate-200'}">Outside Country</button>
          </div>
        </div>
        <div id="v3-city-wrap" class="${showCity ? '' : 'hidden'}">
          <label id="v3-city-label" class="block text-[11px] font-bold text-slate-700 mb-1">${locVal === 'outside_country' ? 'City & Country Name' : 'City / Town Name'}</label>
          <input id="v3-city" type="text" value="${(c.city || '').replace(/"/g, '&quot;')}" placeholder="${locVal === 'outside_country' ? 'e.g. Dallas, USA / Dubai, UAE' : 'e.g. Hyderabad, Vijayawada, Guntur'}"
            class="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white" />
        </div>
        ${auditLine}`;
      body.appendChild(panel);

      panel.querySelector('#v3-voter-phone').addEventListener('change', (e) => { window.setCamp(v.gp, { voterPhone: e.target.value.trim() }); renderAll(); });
      panel.querySelector('#v3-bus').addEventListener('change', (e) => {
        panel.querySelector('#v3-bus-note-wrap').classList.toggle('hidden', !e.target.checked);
        window.setCamp(v.gp, { busNeeded: e.target.checked }); renderAll();
      });
      panel.querySelector('#v3-bus-note').addEventListener('change', (e) => { window.setCamp(v.gp, { busNote: e.target.value.trim() }); });
      panel.querySelector('#v3-auto').addEventListener('change', (e) => {
        panel.querySelector('#v3-auto-note-wrap').classList.toggle('hidden', !e.target.checked);
        window.setCamp(v.gp, { autoNeeded: e.target.checked }); renderAll();
      });
      panel.querySelector('#v3-auto-note').addEventListener('change', (e) => { window.setCamp(v.gp, { autoNote: e.target.value.trim() }); });
      panel.querySelector('#v3-deceased').addEventListener('change', (e) => { window.setCamp(v.gp, { deceased: e.target.checked }); renderAll(); });
      panel.querySelectorAll('.v3-loc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const nl = btn.dataset.v3Loc;
          window.setCamp(v.gp, { location: nl });
          panel.querySelectorAll('.v3-loc-btn').forEach(b => {
            b.className = 'v3-loc-btn py-2 px-2 rounded-xl text-[11px] font-bold border ' +
              (b.dataset.v3Loc === nl ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-slate-700 border-slate-200');
          });
          const cw = panel.querySelector('#v3-city-wrap');
          const cl = panel.querySelector('#v3-city-label');
          const ci = panel.querySelector('#v3-city');
          if (nl === 'outside_village' || nl === 'outside_country') {
            cw.classList.remove('hidden');
            cl.textContent = nl === 'outside_country' ? 'City & Country Name' : 'City / Town Name';
            ci.placeholder = nl === 'outside_country' ? 'e.g. Dallas, USA / Dubai, UAE' : 'e.g. Hyderabad, Vijayawada, Guntur';
          } else { cw.classList.add('hidden'); }
          renderAll();
        });
      });
      panel.querySelector('#v3-city').addEventListener('change', (e) => { window.setCamp(v.gp, { city: e.target.value.trim() }); renderAll(); });
    }, 30);
  };

  function computeStats(list) {
    let male = 0, female = 0, delivered = 0, contacted = 0, pro = 0, swing = 0, against = 0, deceased = 0, autoNeeded = 0, busNeeded = 0, outCountry = 0, outVillage = 0, withPhone = 0;
    for (const v of list) {
      if (v.gender === 'పు') male++; else if (v.gender === 'స్త్రీ') female++;
      if (!window.canAccessCampaignForWard(v.ward)) continue;
      const c = window.getCamp(v.gp);
      if (c.delivered) delivered++;
      if (c.phone || c.person) contacted++;
      if (c.support === 'pro') pro++; else if (c.support === 'swing') swing++; else if (c.support === 'against') against++;
      if (c.deceased) deceased++;
      if (c.autoNeeded) autoNeeded++;
      if (c.busNeeded) busNeeded++;
      if (c.voterPhone && c.voterPhone.trim()) withPhone++;
      if (c.location === 'outside_country') outCountry++;
      else if (c.location === 'outside_village') outVillage++;
    }
    return { total: list.length, male, female, delivered, contacted, pro, swing, against, deceased, autoNeeded, busNeeded, outCountry, outVillage, withPhone };
  }

  function renderWardStatsBanner() {
    const main = document.querySelector('main');
    if (!main) return;
    let banner = document.getElementById('ward-stats-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'ward-stats-banner';
      banner.className = 'mb-3 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-xs';
      main.prepend(banner);
    }
    const pool = typeof getWardVoters === 'function' ? getWardVoters() : [];
    const st = computeStats(pool);
    const canSee = state.selectedWard === 'all'
      ? (typeof window.getCurrentAuthSession === 'function' && window.getCurrentAuthSession()?.role === 'admin')
      : window.canAccessCampaignForWard(state.selectedWard);

    const scopeLabel = state.selectedWard !== 'all'
      ? `Ward ${state.selectedWard}`
      : (state.selectedZone === 'east' ? 'East (W1–7)' : state.selectedZone === 'west' ? 'West (W8–14)' : 'All 14 Wards');

    if (!canSee) {
      banner.innerHTML = `<div class="flex items-center justify-between text-xs"><span class="font-extrabold text-indigo-800">${scopeLabel} · ${st.total.toLocaleString()} Voters</span><span class="text-slate-500 font-semibold">M: ${st.male} · F: ${st.female} · Read-only view</span></div>`;
      return;
    }

    const delPct = st.total ? Math.round((st.delivered / st.total) * 100) : 0;
    banner.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-1.5 mb-2">
        <span class="text-xs font-extrabold text-indigo-800">${scopeLabel} Stats</span>
        <div class="flex flex-wrap items-center gap-1 text-[11px] font-bold">
          <button type="button" data-stat-filter="bus_needed" class="px-2 py-0.5 rounded-full ${state.fSpecial === 'bus_needed' ? 'bg-cyan-600 text-white' : 'bg-cyan-100 text-cyan-900'}">Bus: ${st.busNeeded}</button>
          <button type="button" data-stat-filter="auto_needed" class="px-2 py-0.5 rounded-full ${state.fSpecial === 'auto_needed' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-900'}">Auto: ${st.autoNeeded}</button>
          <button type="button" data-stat-filter="deceased" class="px-2 py-0.5 rounded-full ${state.fSpecial === 'deceased' ? 'bg-rose-600 text-white' : 'bg-rose-100 text-rose-800'}">Deceased: ${st.deceased}</button>
          <span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Abroad: ${st.outCountry}</span>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-1.5 text-center text-[11px]">
        <div class="bg-slate-50 rounded-xl p-1.5 border border-slate-100"><div class="font-extrabold text-slate-900">${st.total.toLocaleString()}</div><div class="text-[10px] text-slate-500">M:${st.male} F:${st.female}</div></div>
        <div class="bg-emerald-50 rounded-xl p-1.5 border border-emerald-100"><div class="font-extrabold text-emerald-700">${st.delivered} (${delPct}%)</div><div class="text-[10px] text-emerald-700">Delivered</div></div>
        <div class="bg-blue-50 rounded-xl p-1.5 border border-blue-100"><div class="font-extrabold text-blue-700">${st.contacted}</div><div class="text-[10px] text-blue-700">Contacted</div></div>
        <div class="bg-indigo-50 rounded-xl p-1.5 border border-indigo-100"><div class="font-extrabold text-indigo-800">${st.pro}/${st.swing}/${st.against}</div><div class="text-[10px] text-indigo-700">Pro/Sw/Opp</div></div>
      </div>`;
    banner.querySelectorAll('[data-stat-filter]').forEach(btn => {
      btn.addEventListener('click', () => jumpToSpecialFilter(btn.dataset.statFilter));
    });
  }

  function renderDashboardLogisticsCard() {
    if (state.activeTab !== 'dashboard') return;
    const dashContainer = document.getElementById('view-dashboard') || document.getElementById('tab-dashboard') || document.querySelector('main');
    if (!dashContainer) return;
    let card = document.getElementById('v4-dash-logistics');
    if (card) card.remove();

    const pool = typeof getWardVoters === 'function' ? getWardVoters() : [];
    const st = computeStats(pool);
    card = document.createElement('div');
    card.id = 'v4-dash-logistics';
    card.className = 'mb-3 bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-2.5';
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-extrabold uppercase tracking-wide text-indigo-800">Election-Day Transport &amp; Contacts (Tap to Filter)</h3>
        <span class="text-[11px] font-bold text-emerald-700">📞 Phones Saved: ${st.withPhone}</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <button type="button" data-dash-filter="bus_needed" class="p-2.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 transition">
          <div class="text-lg font-extrabold text-cyan-900">${st.busNeeded}</div>
          <div class="text-[11px] font-bold text-cyan-800">Bus Needed</div>
        </button>
        <button type="button" data-dash-filter="auto_needed" class="p-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 transition">
          <div class="text-lg font-extrabold text-amber-900">${st.autoNeeded}</div>
          <div class="text-[11px] font-bold text-amber-800">Auto Needed</div>
        </button>
        <button type="button" data-dash-filter="deceased" class="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 transition">
          <div class="text-lg font-extrabold text-rose-800">${st.deceased}</div>
          <div class="text-[11px] font-bold text-rose-700">Deceased</div>
        </button>
        <div class="p-2.5 rounded-xl bg-purple-50 border border-purple-200">
          <div class="text-lg font-extrabold text-purple-900">${st.outVillage} / ${st.outCountry}</div>
          <div class="text-[11px] font-bold text-purple-800">Out Village / Country</div>
        </div>
      </div>`;
    const anchor = document.getElementById('ward-contestant-banner') || document.getElementById('ward-stats-banner');
    if (anchor && anchor.parentElement) anchor.insertAdjacentElement('afterend', card);
    else dashContainer.prepend(card);

    card.querySelectorAll('[data-dash-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.fSpecial = btn.dataset.dashFilter;
        state.activeTab = 'families';
        state.pageLimit = 50;
        renderAll();
      });
    });
  }

  function wireSyncModalButton() {
    const syncBtn = document.getElementById('sync-btn');
    if (!syncBtn || syncBtn._v3Wired) return;
    syncBtn._v3Wired = true;
    syncBtn.addEventListener('click', () => {
      setTimeout(() => {
        const modal = document.getElementById('sync-modal');
        if (!modal || modal.querySelector('#v3-force-sync-btn')) return;
        const box = modal.querySelector('.overflow-y-auto') || modal;
        const wrap = document.createElement('div');
        wrap.className = 'mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2';
        wrap.innerHTML = `<div class="text-[11px] text-emerald-900"><b>Auto-Connected to Firebase</b><br/>Push any earlier phone marks to DB now.</div><button id="v3-force-sync-btn" type="button" class="shrink-0 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">Sync Now</button>`;
        box.prepend(wrap);
        wrap.querySelector('#v3-force-sync-btn').addEventListener('click', async () => {
          const r = await window.pullFromFirebase(true);
          if (typeof showToast === 'function') showToast(r ? `Synced! Pushed ${r.pushedCount}, pulled ${r.pulledCount}` : 'Sync failed — check connection');
        });
      }, 40);
    });
  }

  const origRenderAll = window.renderAll;
  window.renderAll = function () {
    if (typeof origRenderAll === 'function') origRenderAll();
    renderCompactWardBar();
    renderWardStatsBanner();
    if (typeof window.renderActiveWardContestantBanner === 'function') window.renderActiveWardContestantBanner();
    const oldDash = document.getElementById('v4-dash-logistics');
    if (oldDash) oldDash.remove();
    renderDashboardLogisticsCard();
  };

  function boot() {
    initFirebaseConfig();
    injectCompactMobileCSS();
    wireSyncModalButton();
    if (typeof startLiveSync === 'function') startLiveSync();
    window.pullFromFirebase(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 80);
})();
