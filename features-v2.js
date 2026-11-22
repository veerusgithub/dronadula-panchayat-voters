// features-v2.js — Enhanced Duplicates (Name+Relation+Age+Photo), Safe Firebase Sync & Ward-Wise Stats
(function () {
  'use strict';

  const FB_PERSIST_KEY = 'dronadula_fb_config_v1';
  const photoSimCache = {};

  function restorePersistentFbConfig() {
    try {
      const saved = localStorage.getItem(FB_PERSIST_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.url && (!window.fbConfig || !fbConfig.url || !fbConfig.url.trim())) {
          fbConfig.url = parsed.url;
          fbConfig.room = parsed.room || DEFAULT_ROOM;
        }
      }
      if (typeof fbConfig !== 'undefined' && fbConfig.url) {
        localStorage.setItem(FB_PERSIST_KEY, JSON.stringify(fbConfig));
      }
    } catch (e) {}
  }

  const origSaveState = window.saveState;
  window.saveState = function () {
    if (typeof fbConfig !== 'undefined' && fbConfig.url) {
      try { localStorage.setItem(FB_PERSIST_KEY, JSON.stringify(fbConfig)); } catch (e) {}
    }
    if (typeof origSaveState === 'function') origSaveState();
  };

  window.pullFromFirebase = async function (pushLocalMissing = false) {
    restorePersistentFbConfig();
    if (typeof fbConfig === 'undefined' || !fbConfig.url) return;
    try {
      const base = cleanFbUrl(fbConfig.url);
      const room = encodeURIComponent(fbConfig.room || DEFAULT_ROOM);
      const res = await fetch(`${base}/rooms/${room}.json`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const remote = await res.json();
      let changed = false;

      if (remote && typeof remote === 'object') {
        if (remote.campaign && typeof remote.campaign === 'object') {
          Object.entries(remote.campaign).forEach(([gp, rVal]) => {
            if (!rVal || typeof rVal !== 'object') return;
            const lVal = state.campaign[gp];
            if (!lVal || (rVal._ts || 0) >= (lVal._ts || 0)) {
              if (JSON.stringify(lVal) !== JSON.stringify(rVal)) {
                state.campaign[gp] = rVal;
                changed = true;
              }
            }
          });
        }
        if (remote.mergedHouses && typeof remote.mergedHouses === 'object') Object.assign(state.mergedHouses, remote.mergedHouses);
        if (remote.dismissedCombos && typeof remote.dismissedCombos === 'object') Object.assign(state.dismissedCombos, remote.dismissedCombos);
        if (remote.dupDecisions && typeof remote.dupDecisions === 'object') Object.assign(state.dupDecisions, remote.dupDecisions);
        if (remote.auth && typeof window._mergeRemoteAuth === 'function') window._mergeRemoteAuth(remote.auth);
      }

      if (pushLocalMissing && Object.keys(state.campaign).length > 0) {
        const remoteCamp = (remote && remote.campaign) || {};
        const patchPayload = {};
        Object.entries(state.campaign).forEach(([gp, lVal]) => {
          const rVal = remoteCamp[gp];
          if (!rVal || (lVal._ts || 0) > (rVal._ts || 0)) patchPayload[gp] = lVal;
        });
        if (Object.keys(patchPayload).length > 0) {
          await fetch(`${base}/rooms/${room}/campaign.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patchPayload)
          });
        }
      }

      if (changed) {
        window.saveState();
        if (typeof renderAll === 'function') renderAll();
      }
      if (typeof updateSyncIndicator === 'function') updateSyncIndicator(true);
    } catch (e) {
      if (typeof updateSyncIndicator === 'function') updateSyncIndicator(false);
    }
  };

  function normDupName(str) {
    if (!str) return '';
    if (typeof phoneticNorm === 'function') return phoneticNorm(str).replace(/\s+/g, '');
    return String(str).toLowerCase().replace(/\s+/g, '');
  }

  window.computeDuplicates = function (includeCrossWard) {
    const pool = includeCrossWard ? state.voters : getWardVoters();
    const alerts = [];
    const seenPairs = new Set();

    function addAlert(type, confidence, list, reason) {
      const gps = list.map(x => x.gp).sort((a, b) => a - b);
      const key = `${type}:${gps.join('-')}`;
      if (seenPairs.has(key)) return;
      seenPairs.add(key);
      alerts.push({ key, type, confidence, voters: list, reason, decision: state.dupDecisions[key] || null });
    }

    const byEpic = new Map();
    pool.forEach(v => {
      if (!v.epic) return;
      const ep = v.epic.trim().toUpperCase();
      if (!byEpic.has(ep)) byEpic.set(ep, []);
      byEpic.get(ep).push(v);
    });
    byEpic.forEach((lst, epic) => {
      if (lst.length > 1) addAlert('EPIC Match', 'high', lst, `Same EPIC ID (${epic})`);
    });

    const byNameRel = new Map();
    pool.forEach(v => {
      const nKey = normDupName(v.name);
      const rKey = normDupName(v.relName);
      if (!nKey || !rKey) return;
      const k = `${nKey}|${rKey}`;
      if (!byNameRel.has(k)) byNameRel.set(k, []);
      byNameRel.get(k).push(v);
    });

    byNameRel.forEach(lst => {
      if (lst.length < 2) return;
      const sorted = [...lst].sort((a, b) => (a.age || 0) - (b.age || 0));
      let group = [sorted[0]];
      const emit = (g) => {
        const ages = g.map(x => x.age || 0);
        const diff = Math.max(...ages) - Math.min(...ages);
        const relLabel = g[0].relType || 'Relation';
        addAlert(
          diff === 0 ? 'Name + Relation + Exact Age' : 'Name + Relation + Age (±1y)',
          diff === 0 ? 'high' : 'medium',
          g,
          `Same Name, ${relLabel} Name & Age (${ages.join('/')}y)`
        );
      };
      for (let i = 1; i < sorted.length; i++) {
        if (Math.abs((sorted[i].age || 0) - (group[group.length - 1].age || 0)) <= 1) {
          group.push(sorted[i]);
        } else {
          if (group.length > 1) emit(group);
          group = [sorted[i]];
        }
      }
      if (group.length > 1) emit(group);
    });

    alerts.sort((a, b) => {
      if (!!a.decision !== !!b.decision) return a.decision ? 1 : -1;
      if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
      return a.voters[0].gp - b.voters[0].gp;
    });
    return alerts;
  };

  function loadPhotoGray16(gp) {
    return new Promise((resolve) => {
      const b64 = window.VOTER_PHOTOS && window.VOTER_PHOTOS[String(gp)];
      if (!b64) { resolve(null); return; }
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 16; c.height = 16;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, 16, 16);
          const d = ctx.getImageData(0, 0, 16, 16).data;
          const gray = new Float32Array(256);
          let mean = 0;
          for (let i = 0; i < 256; i++) { gray[i] = 0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2]; mean += gray[i]; }
          mean /= 256;
          let norm = 0;
          for (let i = 0; i < 256; i++) { gray[i] -= mean; norm += gray[i] * gray[i]; }
          norm = Math.sqrt(norm) || 1;
          for (let i = 0; i < 256; i++) gray[i] /= norm;
          resolve(gray);
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = 'data:image/webp;base64,' + b64;
    });
  }

  async function computeAlertPhotoSimilarity(alert) {
    if (photoSimCache[alert.key] !== undefined) return photoSimCache[alert.key];
    const vecs = (await Promise.all(alert.voters.map(v => loadPhotoGray16(v.gp)))).filter(Boolean);
    if (vecs.length < 2) { photoSimCache[alert.key] = null; return null; }
    let best = -1;
    for (let i = 0; i < vecs.length; i++) {
      for (let j = i + 1; j < vecs.length; j++) {
        let dot = 0;
        for (let k = 0; k < 256; k++) dot += vecs[i][k] * vecs[j][k];
        const pct = Math.max(0, Math.min(100, Math.round(((dot + 1) / 2) * 100)));
        if (pct > best) best = pct;
      }
    }
    photoSimCache[alert.key] = best;
    return best;
  }

  const origRenderIntel = window.renderIntel;
  window.renderIntel = function () {
    if (typeof origRenderIntel === 'function') origRenderIntel();
    if (state.intelSub !== 'dups') return;
    const alerts = window.computeDuplicates(state.selectedWard === 'all' || state.crossWardDups);
    const cards = document.querySelectorAll('#content-area > div');
    alerts.forEach((a, idx) => {
      const card = cards[idx];
      if (!card || !card.firstElementChild || !card.firstElementChild.firstElementChild) return;
      let badge = card.querySelector('.photo-sim-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'photo-sim-badge px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600';
        badge.textContent = 'Checking photo...';
        card.firstElementChild.firstElementChild.appendChild(badge);
      }
      computeAlertPhotoSimilarity(a).then(pct => {
        if (pct === null) {
          badge.className = 'photo-sim-badge px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500';
          badge.textContent = 'Photo N/A';
        } else if (pct >= 78) {
          badge.className = 'photo-sim-badge px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800';
          badge.textContent = `Photo Match ${pct}% (Same Person)`;
        } else if (pct >= 62) {
          badge.className = 'photo-sim-badge px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800';
          badge.textContent = `Photo Match ${pct}% (Verify)`;
        } else {
          badge.className = 'photo-sim-badge px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600';
          badge.textContent = `Photo Diff (${pct}%)`;
        }
      });
    });
  };

  function calcPoolStats(list) {
    let male = 0, female = 0, other = 0, delivered = 0, contacted = 0, pro = 0, swing = 0, against = 0, outside = 0, tickets = 0;
    list.forEach(v => {
      if (v.gender === 'పు') male++;
      else if (v.gender === 'స్త్రీ') female++;
      else other++;
      const c = getCamp(v.gp);
      if (c.delivered) delivered++;
      if (c.phone || c.person) contacted++;
      if (c.support === 'pro') pro++;
      else if (c.support === 'swing') swing++;
      else if (c.support === 'against') against++;
      if (c.location === 'outside') { outside++; if (c.ticket !== 'none') tickets++; }
    });
    const total = list.length;
    return { total, male, female, other, delivered, contacted, pro, swing, against, outside, tickets, pct: total ? Math.round((delivered / total) * 100) : 0 };
  }

  function ensureWardBanner() {
    let el = document.getElementById('ward-stats-banner');
    if (!el) {
      const ca = document.getElementById('content-area');
      if (!ca) return null;
      el = document.createElement('div');
      el.id = 'ward-stats-banner';
      el.className = 'mb-2.5';
      ca.parentNode.insertBefore(el, ca);
    }
    return el;
  }

  function renderWardStatsBanner() {
    const el = ensureWardBanner();
    if (!el) return;
    if (state.activeTab === 'dashboard') { el.classList.add('hidden'); return; }
    const s = calcPoolStats(getWardVoters());
    const scopeTitle = state.selectedWard !== 'all'
      ? `Ward ${state.selectedWard} Stats`
      : (state.selectedZone === 'east' ? 'East (Wards 1–7) Stats' : state.selectedZone === 'west' ? 'West (Wards 8–14) Stats' : 'All Panchayat (14 Wards) Stats');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 px-3 py-2 shadow-xs">
        <div class="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
          <span class="text-[11px] font-extrabold text-indigo-800 uppercase tracking-wide">${scopeTitle}</span>
          <span class="text-[11px] font-bold text-slate-600">Total: <b class="text-slate-900">${s.total.toLocaleString()}</b> (M: ${s.male} · F: ${s.female}${s.other ? ' · O: ' + s.other : ''})</span>
        </div>
        <div class="grid grid-cols-5 gap-1 text-center text-[10px]">
          <div class="bg-emerald-50 border border-emerald-200 rounded-lg py-1"><div class="font-extrabold text-emerald-700">${s.delivered} (${s.pct}%)</div><div class="text-emerald-700/80 font-semibold">Given</div></div>
          <div class="bg-indigo-50 border border-indigo-200 rounded-lg py-1"><div class="font-extrabold text-indigo-700">${s.contacted}</div><div class="text-indigo-700/80 font-semibold">Contact</div></div>
          <div class="bg-green-50 border border-green-200 rounded-lg py-1"><div class="font-extrabold text-green-700">${s.pro}</div><div class="text-green-700/80 font-semibold">Pro</div></div>
          <div class="bg-amber-50 border border-amber-200 rounded-lg py-1"><div class="font-extrabold text-amber-700">${s.swing}</div><div class="text-amber-700/80 font-semibold">Swing</div></div>
          <div class="bg-rose-50 border border-rose-200 rounded-lg py-1"><div class="font-extrabold text-rose-700">${s.against}</div><div class="text-rose-700/80 font-semibold">Opp</div></div>
        </div>
      </div>`;
  }

  const origRenderDashboard = window.renderDashboard;
  window.renderDashboard = function () {
    if (typeof origRenderDashboard === 'function') origRenderDashboard();
    const wrap = document.getElementById('content-area')?.firstElementChild;
    if (!wrap) return;
    const eastS = calcPoolStats(state.voters.filter(v => v.ward >= 1 && v.ward <= 7));
    const westS = calcPoolStats(state.voters.filter(v => v.ward >= 8 && v.ward <= 14));
    const wards = getZoneWards(state.selectedZone);
    const wardDetails = wards.map(w => ({ w, ...calcPoolStats(state.voters.filter(v => v.ward === w)) }));
    const tot = calcPoolStats(getZoneVoters(state.selectedZone));

    wrap.insertAdjacentHTML('beforeend', `
      <div class="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-2.5">
        <h3 class="text-xs font-extrabold uppercase tracking-wide text-slate-600">East vs. West Zone Summary</h3>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div class="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1">
            <div class="font-extrabold text-indigo-800">East (Wards 1–7)</div>
            <div class="text-[11px] text-slate-700">Total: <b>${eastS.total.toLocaleString()}</b> (M: ${eastS.male}, F: ${eastS.female})</div>
            <div class="text-[11px] text-emerald-700 font-bold">Given: ${eastS.delivered} (${eastS.pct}%)</div>
            <div class="text-[10px] text-slate-600">Pro: <b>${eastS.pro}</b> · Swing: <b>${eastS.swing}</b> · Opp: <b>${eastS.against}</b></div>
          </div>
          <div class="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
            <div class="font-extrabold text-amber-900">West (Wards 8–14)</div>
            <div class="text-[11px] text-slate-700">Total: <b>${westS.total.toLocaleString()}</b> (M: ${westS.male}, F: ${westS.female})</div>
            <div class="text-[11px] text-emerald-700 font-bold">Given: ${westS.delivered} (${westS.pct}%)</div>
            <div class="text-[10px] text-slate-600">Pro: <b>${westS.pro}</b> · Swing: <b>${westS.swing}</b> · Opp: <b>${westS.against}</b></div>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div class="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-extrabold text-slate-700 uppercase">Detailed Ward-Wise Stats (M/F · Delivery % · Leaning)</div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr><th class="py-2 px-2.5">Ward</th><th class="py-2 px-2">Total</th><th class="py-2 px-2">M / F</th><th class="py-2 px-2">Given %</th><th class="py-2 px-2 text-emerald-700">Pro</th><th class="py-2 px-2 text-amber-700">Swing</th><th class="py-2 px-2 text-rose-700">Opp</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${wardDetails.map(r => `
                <tr data-jump-ward="${r.w}" class="hover:bg-indigo-50/60 cursor-pointer">
                  <td class="py-2 px-2.5 font-bold text-indigo-700">W${r.w}</td>
                  <td class="py-2 px-2 font-bold">${r.total}</td>
                  <td class="py-2 px-2 text-slate-600">${r.male}/${r.female}</td>
                  <td class="py-2 px-2 font-semibold">${r.delivered} (${r.pct}%)</td>
                  <td class="py-2 px-2 font-bold text-emerald-700">${r.pro}</td>
                  <td class="py-2 px-2 font-bold text-amber-700">${r.swing}</td>
                  <td class="py-2 px-2 font-bold text-rose-700">${r.against}</td>
                </tr>`).join('')}
              <tr class="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300">
                <td class="py-2 px-2.5">Total</td><td class="py-2 px-2">${tot.total.toLocaleString()}</td><td class="py-2 px-2">${tot.male}/${tot.female}</td>
                <td class="py-2 px-2">${tot.delivered} (${tot.pct}%)</td><td class="py-2 px-2 text-emerald-800">${tot.pro}</td>
                <td class="py-2 px-2 text-amber-800">${tot.swing}</td><td class="py-2 px-2 text-rose-800">${tot.against}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`);
  };

  const origRenderAll = window.renderAll;
  window.renderAll = function () {
    if (typeof origRenderAll === 'function') origRenderAll();
    renderWardStatsBanner();
  };

  window.addEventListener('DOMContentLoaded', () => {
    restorePersistentFbConfig();
    if (typeof fbConfig !== 'undefined' && fbConfig.url) window.pullFromFirebase(false);
    renderWardStatsBanner();
  });
})(); {
  'use strict';
