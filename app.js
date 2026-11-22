    const STORAGE_KEY = 'sliptrack_dronadula_v3';
    const DEFAULT_FIREBASE_URL = '';
    const DEFAULT_ROOM = 'dronadula_main';
    let fbConfig = { url: DEFAULT_FIREBASE_URL, room: DEFAULT_ROOM };
    let syncTimer = null;
    let state = {
      voters: [],
      // campaign[gp] = { delivered: bool, phone: bool, person: bool, support: 'pro'|'swing'|'against'|'unknown', wish: '', location: 'in_village'|'outside', ticket: 'none'|'promised'|'sent', city: '', unit: '' }
      campaign: {},
      mergedHouses: {},    // "ward::variantHouse" -> canonicalHouse
      dismissedCombos: {},
      dupDecisions: {},
      selectedZone: 'all',
      selectedWard: 'all',
      activeTab: 'families',
      intelSub: 'dups',
      crossWardDups: false,
      fDelivery: 'all',
      fContact: 'all',
      fSupport: 'all',
      fLocation: 'all',
      sortBy: 'gp',
      search: '',
      lang: 'en',
      pageLimit: 50,
      selectedLineageHouse: null
    };

    const I18N = {
      en: {
        title: 'ద్రోణాదుల పంచాయతీ ఓటర్లు',
        subtitle: '104-Parchur · 14 Wards · 5,655 Voters (East & West)',
        langBtn: 'తెలుగు',
        navDash: 'Dashboard', navFamilies: 'Families', navSerials: 'Serials', navIntel: 'Lineage/Dups',
        allWards: 'All Wards', allEast: 'All East', allWest: 'All West', ward: 'Ward',
        zoneAll: 'All Panchayat', zoneEast: 'East (Wards 1–7)', zoneWest: 'West (Wards 8–14)',
        searchPh: 'Search GP Serial (2822), House (5-34), Name, EPIC, Wish...',
        giveAll: 'All Delivered', house: 'House', lineageBtn: 'Lineage'
      },
      te: {
        title: 'ద్రోణాదుల పంచాయతీ ఓటర్లు',
        subtitle: '104-పర్చూరు · 14 వార్డులు · 5,655 ఓటర్లు (తూర్పు & పడమర)',
        langBtn: 'English',
        navDash: 'డాష్‌బోర్డ్', navFamilies: 'కుటుంబాలు', navSerials: 'వరుస సంఖ్య', navIntel: 'వంశవృక్షం/నకిలీలు',
        allWards: 'అన్ని వార్డులు', allEast: 'తూర్పు అన్నీ', allWest: 'పడమర అన్నీ', ward: 'వార్డు',
        zoneAll: 'మొత్తం పంచాయతీ', zoneEast: 'తూర్పు (వార్డులు 1–7)', zoneWest: 'పడమర (వార్డులు 8–14)',
        searchPh: 'గ్రా.పం.సంఖ్య (2822), ఇంటి నం (5-34), పేరు, EPIC వెతకండి...',
        giveAll: 'అన్నీ ఇచ్చాము', house: 'ఇంటి నం.', lineageBtn: 'వంశవృక్షం'
      }
    };
    function t(k) { return I18N[state.lang][k] || k; }

    function showToast(msg) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.classList.remove('hidden');
      clearTimeout(el._timer);
      el._timer = setTimeout(() => el.classList.add('hidden'), 2400);
    }

    function getCamp(gp) {
      return state.campaign[gp] || {
        delivered: false, phone: false, person: false,
        support: 'unknown', wish: '',
        location: 'in_village', ticket: 'none', city: '', unit: ''
      };
    }

    function setCamp(gp, patch) {
      const updated = { ...getCamp(gp), ...patch, _ts: Date.now() };
      state.campaign[gp] = updated;
      saveState();
      pushVoterToFirebase(gp, updated);
    }

    function cleanFbUrl(u) {
      return (u || '').trim().replace(/\/+$/, '');
    }

    async function pushVoterToFirebase(gp, record) {
      if (!fbConfig.url) return;
      try {
        const base = cleanFbUrl(fbConfig.url);
        const room = encodeURIComponent(fbConfig.room || DEFAULT_ROOM);
        await fetch(`${base}/rooms/${room}/campaign/${gp}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record)
        });
        updateSyncIndicator(true);
      } catch (e) { updateSyncIndicator(false); }
    }

    async function pushMetaToFirebase(node, key, val) {
      if (!fbConfig.url) return;
      try {
        const base = cleanFbUrl(fbConfig.url);
        const room = encodeURIComponent(fbConfig.room || DEFAULT_ROOM);
        await fetch(`${base}/rooms/${room}/${node}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: val })
        });
        if (saved.fbConfig && saved.fbConfig.url) fbConfig = saved.fbConfig;
      } catch (e) {}
      try {
        const params = new URLSearchParams(window.location.search);
        const fbParam = params.get('fb');
        const roomParam = params.get('room');
        if (fbParam) {
          fbConfig = { url: cleanFbUrl(fbParam), room: roomParam || DEFAULT_ROOM };
        }
      } catch (e) {}
    }

    async function pullFromFirebase(pushLocalIfEmpty = false) {
      if (!fbConfig.url) return;
      try {
        const base = cleanFbUrl(fbConfig.url);
        const room = encodeURIComponent(fbConfig.room || DEFAULT_ROOM);
        const res = await fetch(`${base}/rooms/${room}.json`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const remote = await res.json();
        if (remote && typeof remote === 'object') {
          let changed = false;
          if (remote.campaign) {
            Object.entries(remote.campaign).forEach(([gp, rVal]) => {
              if (!rVal) return;
              const lVal = state.campaign[gp];
              if (!lVal || (rVal._ts || 0) > (lVal._ts || 0)) {
                state.campaign[gp] = rVal;
                changed = true;
              }
            });
          }
          if (remote.mergedHouses) { Object.assign(state.mergedHouses, remote.mergedHouses); changed = true; }
          if (remote.dismissedCombos) { Object.assign(state.dismissedCombos, remote.dismissedCombos); changed = true; }
          if (remote.dupDecisions) { Object.assign(state.dupDecisions, remote.dupDecisions); changed = true; }
          if (changed) { saveState(); renderAll(); }
        } else if (pushLocalIfEmpty && Object.keys(state.campaign).length > 0) {
          await fetch(`${base}/rooms/${room}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              campaign: state.campaign,
              mergedHouses: state.mergedHouses,
              dismissedCombos: state.dismissedCombos,
              dupDecisions: state.dupDecisions
            })
          });
        }
        updateSyncIndicator(true);
      } catch (e) {
        updateSyncIndicator(false);
      }
    }

    function updateSyncIndicator(ok) {
      const dot = document.getElementById('live-dot');
      const lbl = document.getElementById('live-lbl');
      const badge = document.getElementById('fb-status-badge');
      const disBtn = document.getElementById('fb-disconnect-btn');
      const shareWrap = document.getElementById('fb-share-wrap');
      if (!fbConfig.url) {
        dot.className = 'w-2 h-2 rounded-full bg-slate-300';
        lbl.textContent = 'Sync';
        if (badge) { badge.textContent = 'Offline'; badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700'; }
        if (disBtn) disBtn.classList.add('hidden');
        if (shareWrap) shareWrap.classList.add('hidden');
        return;
      }
      dot.className = ok ? 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse' : 'w-2 h-2 rounded-full bg-amber-400';
      lbl.textContent = ok ? 'Live' : 'Retry';
      if (badge) {
        badge.textContent = ok ? 'Live Connected' : 'Connection Error';
        badge.className = ok ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white' : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white';
      }
      if (disBtn) disBtn.classList.remove('hidden');
      if (shareWrap) shareWrap.classList.remove('hidden');
    }

    function startLiveSync() {
      clearInterval(syncTimer);
      if (!fbConfig.url) { updateSyncIndicator(false); return; }
      pullFromFirebase(true);
      syncTimer = setInterval(() => {
        if (!document.hidden) pullFromFirebase(false);
      }, 5000);
    }

    function saveState() {
      try {
        const customVoters = state.voters.filter(v => v.custom);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          campaign: state.campaign,
          mergedHouses: state.mergedHouses,
          dismissedCombos: state.dismissedCombos,
          dupDecisions: state.dupDecisions,
          customVoters,
          lang: state.lang,
          fbConfig
        }));
      } catch (e) {}
    }

    function loadState() {
      state.voters = RAW_VOTERS.map(r => ({
        gp: r[0], ward: r[1], asm: r[2], name: r[3],
        relType: r[4], relName: r[5], age: r[6], gender: r[7],
        house: r[8], epic: r[9], custom: false
      }));
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (saved.campaign) state.campaign = saved.campaign;
        if (saved.mergedHouses) state.mergedHouses = saved.mergedHouses;
        if (saved.dismissedCombos) state.dismissedCombos = saved.dismissedCombos;
        if (saved.dupDecisions) state.dupDecisions = saved.dupDecisions;
        if (saved.lang) state.lang = saved.lang;
        if (Array.isArray(saved.customVoters)) {
          saved.customVoters.forEach(cv => {
            const idx = state.voters.findIndex(v => v.gp === cv.gp);
            if (idx >= 0) state.voters[idx] = cv;
            else state.voters.push(cv);
          });
        }
      } catch (e) {}
    }

    function photoTag(gp, cls = 'w-10 h-12 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100') {
      const b64 = VOTER_PHOTOS[String(gp)];
      if (b64) {
        return `<img src="data:image/webp;base64,${b64}" alt="Voter ${gp}" loading="lazy" class="${cls}" />`;
      }
      return `<div class="${cls} flex items-center justify-center text-slate-400 text-[10px] font-bold">No Pic</div>`;
    }

    function normHouse(h) {
      return (h || '').toString().trim().toLowerCase().replace(/\s+/g, '').replace(/[\/\.]/g, '-');
    }

    // Household key accounts for both merged houses AND segregated living units!
    function effectiveHouse(v) {
      const c = getCamp(v.gp);
      if (c.unit && c.unit.trim()) return c.unit.trim();
      const raw = (v.house || '').trim() || 'Unknown';
      const key = `${v.ward}::${raw}`;
      return state.mergedHouses[key] || raw;
    }

    function extractSurname(name) {
      const parts = (name || '').trim().split(/\s+/);
      return parts.length > 1 ? parts[parts.length - 1] : (parts[0] || '');
    }

    function getZoneWards(zone = state.selectedZone) {
      if (zone === 'east') return [1,2,3,4,5,6,7];
      if (zone === 'west') return [8,9,10,11,12,13,14];
      return [1,2,3,4,5,6,7,8,9,10,11,12,13,14];
    }

    function getZoneVoters(zone = state.selectedZone) {
      if (zone === 'east') return state.voters.filter(v => v.ward >= 1 && v.ward <= 7);
      if (zone === 'west') return state.voters.filter(v => v.ward >= 8 && v.ward <= 14);
      return state.voters;
    }

    function getWardVoters(ward = state.selectedWard) {
      if (ward === 'all') return getZoneVoters(state.selectedZone);
      return state.voters.filter(v => v.ward === ward);
    }

    function matchesAllCriteria(v) {
      const c = getCamp(v.gp);
      const q = state.search.trim().toLowerCase();
      if (q) {
        const hit = String(v.gp).includes(q) ||
          (v.asm && v.asm.toLowerCase().includes(q)) ||
          (v.name && v.name.toLowerCase().includes(q)) ||
          (v.relName && v.relName.toLowerCase().includes(q)) ||
          (v.house && v.house.toLowerCase().includes(q)) ||
          (v.epic && v.epic.toLowerCase().includes(q)) ||
          (c.unit && c.unit.toLowerCase().includes(q)) ||
          (c.wish && c.wish.toLowerCase().includes(q)) ||
          (c.city && c.city.toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (state.fDelivery === 'delivered' && !c.delivered) return false;
      if (state.fDelivery === 'pending' && c.delivered) return false;

      if (state.fContact === 'phone' && !c.phone) return false;
      if (state.fContact === 'person' && !c.person) return false;
      if (state.fContact === 'any' && !c.phone && !c.person) return false;
      if (state.fContact === 'none' && (c.phone || c.person)) return false;

      if (state.fSupport !== 'all' && c.support !== state.fSupport) return false;

      if (state.fLocation === 'in_village' && c.location !== 'in_village') return false;
      if (state.fLocation === 'outside' && c.location !== 'outside') return false;
      if (state.fLocation === 'ticket_yes' && !(c.location === 'outside' && (c.ticket === 'promised' || c.ticket === 'sent'))) return false;
      if (state.fLocation === 'ticket_no' && !(c.location === 'outside' && c.ticket === 'none')) return false;

      return true;
    }

    function sortVoters(list) {
      const arr = [...list];
      if (state.sortBy === 'surname') {
        arr.sort((a, b) => extractSurname(a.name).localeCompare(extractSurname(b.name), 'te') || a.name.localeCompare(b.name, 'te'));
      } else if (state.sortBy === 'age_asc') {
        arr.sort((a, b) => (a.age || 0) - (b.age || 0) || a.gp - b.gp);
      } else if (state.sortBy === 'age_desc') {
        arr.sort((a, b) => (b.age || 0) - (a.age || 0) || a.gp - b.gp);
      } else if (state.sortBy === 'house') {
        arr.sort((a, b) => effectiveHouse(a).localeCompare(effectiveHouse(b), undefined, { numeric: true }) || a.gp - b.gp);
      } else if (state.sortBy === 'asm') {
        arr.sort((a, b) => a.asm.localeCompare(b.asm, undefined, { numeric: true }));
      } else {
        arr.sort((a, b) => a.gp - b.gp);
      }
      return arr;
    }

    function computeDuplicates(includeCrossWard) {
      const pool = includeCrossWard ? state.voters : getWardVoters();
      const alerts = [];
      const seenPairs = new Set();

      function addAlert(type, confidence, list, reason) {
        const gps = list.map(x => x.gp).sort((a,b) => a-b);
        const key = `${type}:${gps.join('-')}`;
        if (seenPairs.has(key)) return;
        seenPairs.add(key);
        alerts.push({ key, type, confidence, voters: list, reason, decision: state.dupDecisions[key] || null });
      }

      const byEpic = new Map();
      pool.forEach(v => {
        if (!v.epic) return;
        if (!byEpic.has(v.epic)) byEpic.set(v.epic, []);
        byEpic.get(v.epic).push(v);
      });
      byEpic.forEach((lst, epic) => {
        if (lst.length > 1) addAlert('EPIC Match', 'high', lst, `Duplicate EPIC ${epic}`);
      });

      const byNameRel = new Map();
      pool.forEach(v => {
        const k = `${v.name.trim()}|${v.relName.trim()}|${v.gender}`;
        if (!byNameRel.has(k)) byNameRel.set(k, []);
        byNameRel.get(k).push(v);
      });
      byNameRel.forEach(lst => {
        if (lst.length > 1) {
          const ages = lst.map(x => x.age || 0);
          const diff = Math.max(...ages) - Math.min(...ages);
          addAlert(diff <= 2 ? 'Name + Relation + Age' : 'Name + Relation', diff <= 2 ? 'high' : 'medium', lst,
            `Same Name & Relation (Age diff ${diff}y)`);
        }
      });

      alerts.sort((a, b) => {
        if (!!a.decision !== !!b.decision) return a.decision ? 1 : -1;
        if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
        return a.voters[0].gp - b.voters[0].gp;
      });
      return alerts;
    }

    function computeCombinations() {
      const pool = getWardVoters();
      const byWardNorm = new Map();
      pool.forEach(v => {
        const raw = effectiveHouse(v);
        const norm = `${v.ward}::${normHouse(raw).replace(/-+/g, '')}`;
        if (!byWardNorm.has(norm)) byWardNorm.set(norm, new Map());
        const m = byWardNorm.get(norm);
        if (!m.has(raw)) m.set(raw, []);
        m.get(raw).push(v);
      });

      const combos = [];
      byWardNorm.forEach((variantMap, normKey) => {
        if (variantMap.size > 1) {
          const variants = Array.from(variantMap.entries()).map(([house, members]) => ({ house, members }));
          const cKey = `norm:${normKey}`;
          if (!state.dismissedCombos[cKey]) {
            combos.push({ key: cKey, ward: variants[0].members[0].ward, variants });
          }
        }
      });
      return combos;
    }

    function renderZonePills() {
      const zc = document.getElementById('zone-pills');
      if (!zc) return;
      const allV = state.voters;
      const eastV = allV.filter(v => v.ward >= 1 && v.ward <= 7);
      const westV = allV.filter(v => v.ward >= 8 && v.ward <= 14);
      const zones = [
        { id: 'all', label: t('zoneAll'), count: allV.length },
        { id: 'east', label: t('zoneEast'), count: eastV.length },
        { id: 'west', label: t('zoneWest'), count: westV.length }
      ];
      zc.innerHTML = zones.map(z => {
        const active = state.selectedZone === z.id;
        return `<button data-zone="${z.id}" type="button" class="zone-pill shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
          active ? 'bg-amber-400 text-slate-900 shadow-sm' : 'bg-white/10 text-indigo-100 hover:bg-white/20'
        }">
          <span>${z.label}</span>
          <span class="text-[10px] px-1.5 py-0.2 rounded-full ${active ? 'bg-slate-900/15 text-slate-900' : 'bg-indigo-950/60 text-indigo-200'}">${z.count.toLocaleString()}</span>
        </button>`;
      }).join('');

      zc.querySelectorAll('.zone-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const z = btn.dataset.zone;
          state.selectedZone = z;
          const allowed = getZoneWards(z);
          if (state.selectedWard !== 'all' && !allowed.includes(state.selectedWard)) {
            state.selectedWard = 'all';
          }
          state.pageLimit = 50;
          renderAll();
        });
      });
    }

    function renderWardPills() {
      renderZonePills();
      const container = document.getElementById('ward-pills');
      const zoneVoters = getZoneVoters(state.selectedZone);
      const totalDone = zoneVoters.filter(v => getCamp(v.gp).delivered).length;
      const allLabel = state.selectedZone === 'east' ? t('allEast') : (state.selectedZone === 'west' ? t('allWest') : t('allWards'));
      const pills = [{ id: 'all', label: `${allLabel} (${zoneVoters.length})`, count: `${totalDone}/${zoneVoters.length}` }];
      for (const w of getZoneWards(state.selectedZone)) {
        const wVoters = state.voters.filter(v => v.ward === w);
        const wDone = wVoters.filter(v => getCamp(v.gp).delivered).length;
        pills.push({ id: w, label: `${t('ward')} ${w}`, count: `${wDone}/${wVoters.length}` });
      }
      container.innerHTML = pills.map(p => {
        const active = state.selectedWard === p.id;
        return `<button data-ward="${p.id}" type="button" class="ward-pill shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
          active ? 'bg-white text-indigo-800 shadow-sm' : 'bg-indigo-700/70 text-indigo-100 hover:bg-indigo-600'
        }">
          <span>${p.label}</span>
          <span class="text-[10px] px-1.5 py-0.2 rounded-full ${active ? 'bg-indigo-100 text-indigo-800' : 'bg-indigo-900/50 text-indigo-200'}">${p.count}</span>
        </button>`;
      }).join('');

      container.querySelectorAll('.ward-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.ward;
          state.selectedWard = val === 'all' ? 'all' : Number(val);
          state.pageLimit = 50;
          renderAll();
        });
      });
    }

    function supportBadge(c) {
      if (c.support === 'pro') return `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">PRO</span>`;
      if (c.support === 'swing') return `<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">SWING</span>`;
      if (c.support === 'against') return `<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">AGAINST</span>`;
      return '';
    }

    function renderVoterRow(v) {
      const c = getCamp(v.gp);
      const isSeg = !!(c.unit && c.unit.trim());
      return `
        <div class="flex items-center gap-2.5 p-2 rounded-xl border ${c.delivered ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200'}">
          <button type="button" data-open-gp="${v.gp}" class="shrink-0">${photoTag(v.gp)}</button>
          <button type="button" data-open-gp="${v.gp}" class="flex-1 text-left min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[11px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">#${v.gp}</span>
              <span class="text-[11px] font-semibold text-slate-500">W${v.ward}</span>
              ${supportBadge(c)}
              ${c.location === 'outside' ? `<span class="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-bold">${c.ticket === 'promised' ? 'Bus Promised' : c.ticket === 'sent' ? 'Ticket Sent' : 'Outside'}</span>` : ''}
              ${isSeg ? `<span class="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">Unit</span>` : ''}
            </div>
            <div class="text-sm font-bold text-slate-900 truncate mt-0.5">${v.name}</div>
            <div class="text-[11px] text-slate-600 truncate">
              ${v.relType}: ${v.relName} · ${v.age}y · ${v.gender} · <span class="font-semibold">${v.house}</span>
            </div>
            <div class="flex items-center gap-2 mt-0.5 text-[10px] font-semibold text-slate-500">
              ${c.phone ? '<span class="text-indigo-600">📞 Phone</span>' : ''}
              ${c.person ? '<span class="text-indigo-600">🤝 In-Person</span>' : ''}
              ${c.wish ? `<span class="text-amber-700 truncate max-w-[160px]">★ ${c.wish}</span>` : ''}
            </div>
          </button>
          <button type="button" data-toggle-del="${v.gp}" class="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition ${
            c.delivered ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
          }">
            ${c.delivered ? '✓ Given' : 'Deliver'}
          </button>
        </div>
      `;
    }

    function renderDashboard() {
      const container = document.getElementById('content-area');
      document.getElementById('load-more-wrap').classList.add('hidden');
      const pool = getWardVoters();
      const n = pool.length || 1;

      let delivered = 0, phone = 0, person = 0, pro = 0, swing = 0, against = 0, unknown = 0, wishes = 0;
      let inVil = 0, outside = 0, tickPromised = 0, tickSent = 0, tickNone = 0;

      pool.forEach(v => {
        const c = getCamp(v.gp);
        if (c.delivered) delivered++;
        if (c.phone) phone++;
        if (c.person) person++;
        if (c.support === 'pro') pro++;
        else if (c.support === 'swing') swing++;
        else if (c.support === 'against') against++;
        else unknown++;
        if (c.wish && c.wish.trim()) wishes++;
        if (c.location === 'outside') {
          outside++;
          if (c.ticket === 'promised') tickPromised++;
          else if (c.ticket === 'sent') tickSent++;
          else tickNone++;
        } else {
          inVil++;
        }
      });

      const pct = (x) => Math.round((x / n) * 100);
      const wardRows = getZoneWards(state.selectedZone).map(w => {
        const wv = state.voters.filter(v => v.ward === w);
        let wd = 0, wp = 0, ws = 0, wa = 0, wo = 0, wt = 0;
        wv.forEach(v => {
          const c = getCamp(v.gp);
          if (c.delivered) wd++;
          if (c.support === 'pro') wp++;
          else if (c.support === 'swing') ws++;
          else if (c.support === 'against') wa++;
          if (c.location === 'outside') { wo++; if (c.ticket !== 'none') wt++; }
        });
        return { w, total: wv.length, wd, wp, ws, wa, wo, wt };
      });

      container.innerHTML = `
        <div class="space-y-3">
          <!-- Delivery & Contact -->
          <div class="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-2.5">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-extrabold uppercase tracking-wide text-slate-600">Delivery & Contact (${state.selectedWard === 'all' ? 'All Wards' : 'Ward ' + state.selectedWard})</h3>
              <span class="text-xs font-bold text-indigo-700">${delivered}/${pool.length} (${pct(delivered)}%)</span>
            </div>
            <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 transition-all" style="width:${pct(delivered)}%"></div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center pt-1">
              <button type="button" data-dash-filter="delivered" class="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                <div class="text-base font-extrabold text-emerald-700">${delivered}</div>
                <div class="text-[10px] font-bold text-emerald-700">Slips Given</div>
              </button>
              <button type="button" data-dash-filter="phone" class="p-2 rounded-xl bg-indigo-50 border border-indigo-200">
                <div class="text-base font-extrabold text-indigo-700">${phone}</div>
                <div class="text-[10px] font-bold text-indigo-700">Phone Calls</div>
              </button>
              <button type="button" data-dash-filter="person" class="p-2 rounded-xl bg-violet-50 border border-violet-200">
                <div class="text-base font-extrabold text-violet-700">${person}</div>
                <div class="text-[10px] font-bold text-violet-700">In-Person</div>
              </button>
            </div>
          </div>

          <!-- Support Breakdown -->
          <div class="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-2.5">
            <h3 class="text-xs font-extrabold uppercase tracking-wide text-slate-600">Voter Leaning & Swing Wishes</h3>
            <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
              <div class="bg-emerald-500 h-full" style="width:${pct(pro)}%"></div>
              <div class="bg-amber-400 h-full" style="width:${pct(swing)}%"></div>
              <div class="bg-rose-500 h-full" style="width:${pct(against)}%"></div>
            </div>
            <div class="grid grid-cols-4 gap-1.5 text-center">
              <button type="button" data-dash-filter="pro" class="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                <div class="text-sm font-extrabold text-emerald-700">${pro}</div>
                <div class="text-[10px] font-bold text-emerald-700">Pro</div>
              </button>
              <button type="button" data-dash-filter="swing" class="p-2 rounded-xl bg-amber-50 border border-amber-200">
                <div class="text-sm font-extrabold text-amber-700">${swing}</div>
                <div class="text-[10px] font-bold text-amber-700">Swing (${wishes} wishes)</div>
              </button>
              <button type="button" data-dash-filter="against" class="p-2 rounded-xl bg-rose-50 border border-rose-200">
                <div class="text-sm font-extrabold text-rose-700">${against}</div>
                <div class="text-[10px] font-bold text-rose-700">Against</div>
              </button>
              <button type="button" data-dash-filter="unknown" class="p-2 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-sm font-extrabold text-slate-700">${unknown}</div>
                <div class="text-[10px] font-bold text-slate-600">Unassessed</div>
              </button>
            </div>
          </div>

          <!-- Location & Bus Tickets -->
          <div class="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-2.5">
            <h3 class="text-xs font-extrabold uppercase tracking-wide text-slate-600">Village Presence & Bus Tickets</h3>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <button type="button" data-dash-filter="in_village" class="p-2 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-sm font-extrabold text-slate-800">${inVil}</div>
                <div class="text-[10px] font-bold text-slate-600">In Village</div>
              </button>
              <button type="button" data-dash-filter="outside" class="p-2 rounded-xl bg-sky-50 border border-sky-200">
                <div class="text-sm font-extrabold text-sky-800">${outside}</div>
                <div class="text-[10px] font-bold text-sky-700">Outside Village</div>
              </button>
              <button type="button" data-dash-filter="ticket_yes" class="p-2 rounded-xl bg-indigo-50 border border-indigo-200">
                <div class="text-sm font-extrabold text-indigo-700">${tickPromised + tickSent}</div>
                <div class="text-[10px] font-bold text-indigo-700">Tickets Promised/Sent</div>
              </button>
              <button type="button" data-dash-filter="ticket_no" class="p-2 rounded-xl bg-orange-50 border border-orange-200">
                <div class="text-sm font-extrabold text-orange-700">${tickNone}</div>
                <div class="text-[10px] font-bold text-orange-700">Outside · No Ticket</div>
              </button>
            </div>
          </div>

          <!-- Ward-by-Ward Comparison Table -->
          <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div class="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-extrabold text-slate-700 uppercase">Ward-by-Ward Summary (Tap to Open)</div>
            <div class="overflow-x-auto">
              <table class="w-full text-xs text-left">
                <thead class="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th class="py-2 px-3">Ward</th><th class="py-2 px-2">Given</th><th class="py-2 px-2 text-emerald-700">Pro</th><th class="py-2 px-2 text-amber-700">Swing</th><th class="py-2 px-2 text-rose-700">Opp</th><th class="py-2 px-2 text-sky-700">Out (Tkt)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${wardRows.map(r => `
                    <tr data-jump-ward="${r.w}" class="hover:bg-indigo-50/60 cursor-pointer">
                      <td class="py-2 px-3 font-bold text-indigo-700">Ward ${r.w}</td>
                      <td class="py-2 px-2 font-semibold">${r.wd}/${r.total}</td>
                      <td class="py-2 px-2 font-bold text-emerald-700">${r.wp}</td>
                      <td class="py-2 px-2 font-bold text-amber-700">${r.ws}</td>
                      <td class="py-2 px-2 font-bold text-rose-700">${r.wa}</td>
                      <td class="py-2 px-2 font-semibold text-sky-800">${r.wo} (${r.wt})</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    function renderFamilies() {
      const container = document.getElementById('content-area');
      const loadMoreWrap = document.getElementById('load-more-wrap');
      const pool = sortVoters(getWardVoters().filter(matchesAllCriteria));

      const groups = new Map();
      pool.forEach(v => {
        const eh = effectiveHouse(v);
        const key = `${v.ward}::${eh}`;
        if (!groups.has(key)) groups.set(key, { ward: v.ward, house: eh, members: [] });
        groups.get(key).members.push(v);
      });

      const famList = Array.from(groups.values());
      document.getElementById('result-count-lbl').textContent = `${famList.length} households · ${pool.length} voters`;

      if (famList.length === 0) {
        container.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">No matching households found.</div>`;
        loadMoreWrap.classList.add('hidden');
        return;
      }

      const shown = famList.slice(0, state.pageLimit);
      loadMoreWrap.classList.toggle('hidden', famList.length <= state.pageLimit);

      container.innerHTML = shown.map(fam => {
        const doneCount = fam.members.filter(m => getCamp(m.gp).delivered).length;
        const allDone = doneCount === fam.members.length;
        const gpsJson = JSON.stringify(fam.members.map(m => m.gp));
        return `
          <div class="bg-white rounded-2xl border ${allDone ? 'border-emerald-300' : 'border-slate-200'} shadow-xs overflow-hidden">
            <div class="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div class="min-w-0 flex items-center gap-1.5">
                <span class="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[11px] font-bold">W${fam.ward}</span>
                <span class="text-sm font-extrabold text-slate-900 truncate">${t('house')}: ${fam.house}</span>
                <span class="text-xs font-semibold text-slate-500">(${doneCount}/${fam.members.length})</span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" data-view-lineage="${fam.ward}::${fam.house}" class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-bold hover:bg-indigo-100">
                  ${t('lineageBtn')}
                </button>
                <button type="button" data-fam-gps='${gpsJson}' data-fam-done="${allDone ? '0' : '1'}" class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                  allDone ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }">
                  ${allDone ? '✓ All Given' : t('giveAll')}
                </button>
              </div>
            </div>
            <div class="p-2.5 space-y-1.5">
              ${fam.members.map(renderVoterRow).join('')}
            </div>
          </div>
        `;
      }).join('');
    }

    function renderSerials() {
      const container = document.getElementById('content-area');
      const loadMoreWrap = document.getElementById('load-more-wrap');
      const pool = sortVoters(getWardVoters().filter(matchesAllCriteria));
      document.getElementById('result-count-lbl').textContent = `${pool.length} voters`;

      if (pool.length === 0) {
        container.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">No matching voters found.</div>`;
        loadMoreWrap.classList.add('hidden');
        return;
      }

      const shown = pool.slice(0, state.pageLimit);
      loadMoreWrap.classList.toggle('hidden', pool.length <= state.pageLimit);
      container.innerHTML = `<div class="space-y-2">${shown.map(renderVoterRow).join('')}</div>`;
    }

    function buildLineageTree(members) {
      const sorted = [...members].sort((a, b) => (b.age || 0) - (a.age || 0));
      const roots = [];
      const childrenOf = new Map();
      sorted.forEach(m => childrenOf.set(m.gp, []));

      sorted.forEach(m => {
        if (m.relType === 'తండ్రి' || m.relType === 'తల్లి' || m.relType === 'సంబంధం') {
          const rTokens = (m.relName || '').split(/\s+/).filter(Boolean);
          const parent = sorted.find(p => p.gp !== m.gp && (p.age || 0) >= (m.age || 0) + 12 &&
            rTokens.some(tok => tok.length > 2 && p.name.includes(tok)));
          if (parent) {
            childrenOf.get(parent.gp).push(m);
            return;
          }
        }
        roots.push(m);
      });

      const finalRoots = [];
      const spouseOf = new Map();
      roots.forEach(r => {
        if (r.relType === 'భర్త') {
          const rTokens = (r.relName || '').split(/\s+/).filter(Boolean);
          const husband = roots.find(h => h.gp !== r.gp && h.gender === 'పు' &&
            rTokens.some(tok => tok.length > 2 && h.name.includes(tok)));
          if (husband) {
            if (!spouseOf.has(husband.gp)) spouseOf.set(husband.gp, []);
            spouseOf.get(husband.gp).push(r);
            return;
          }
        }
        finalRoots.push(r);
      });
      return { finalRoots, spouseOf, childrenOf };
    }

    function renderIntel() {
      const container = document.getElementById('content-area');
      document.getElementById('load-more-wrap').classList.add('hidden');
      document.getElementById('dup-scope-bar').classList.toggle('hidden', state.intelSub !== 'dups');

      if (state.intelSub === 'dups') {
        const alerts = computeDuplicates(state.selectedWard === 'all' || state.crossWardDups);
        if (alerts.length === 0) {
          container.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">No duplicate candidates found in this ward scope.</div>`;
          return;
        }
        container.innerHTML = alerts.map(a => {
          const badgeCls = a.confidence === 'high' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800';
          const statusBadge = a.decision === 'confirmed'
            ? `<span class="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold">CONFIRMED DUP</span>`
            : a.decision === 'dismissed'
            ? `<span class="px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-bold">NOT A DUP</span>`
            : '';
          return `
            <div class="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2.5 shadow-xs">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-1.5">
                  <span class="px-2 py-0.5 rounded-md text-[11px] font-bold ${badgeCls}">${a.type}</span>
                  ${statusBadge}
                </div>
                <span class="text-[11px] font-medium text-slate-500">${a.reason}</span>
              </div>
              <div class="space-y-1.5">
                ${a.voters.map(v => `
                  <div class="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    ${photoTag(v.gp, 'w-9 h-11 rounded-lg object-cover border border-slate-200 shrink-0')}
                    <div class="flex-1 min-w-0">
                      <div class="font-bold text-slate-900">GP #${v.gp} · Ward ${v.ward} · ${v.name}</div>
                      <div class="text-slate-600">${v.relType}: ${v.relName} · ${v.age}y (${v.gender}) · House ${v.house} · <span class="font-mono font-semibold">${v.epic}</span></div>
                    </div>
                    <button type="button" data-open-gp="${v.gp}" class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-[11px] font-bold text-indigo-700 shrink-0">View</button>
                  </div>
                `).join('')}
              </div>
              <div class="flex items-center gap-2 pt-1">
                <button type="button" data-dup-key="${a.key}" data-dup-val="confirmed" class="flex-1 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700">Confirm Duplicate</button>
                <button type="button" data-dup-key="${a.key}" data-dup-val="dismissed" class="flex-1 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200">Not Duplicate</button>
              </div>
            </div>
          `;
        }).join('');
      } else if (state.intelSub === 'lineage') {
        const pool = getWardVoters().filter(matchesAllCriteria);
        const houses = new Map();
        pool.forEach(v => {
          const ch = `${v.ward}::${effectiveHouse(v)}`;
          if (!houses.has(ch)) houses.set(ch, []);
          houses.get(ch).push(v);
        });
        const houseKeys = Array.from(houses.keys()).slice(0, 50);
        const activeKey = (state.selectedLineageHouse && houses.has(state.selectedLineageHouse)) ? state.selectedLineageHouse : houseKeys[0];

        if (!activeKey) {
          container.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">No households match your search.</div>`;
          return;
        }
        const members = houses.get(activeKey);
        const { finalRoots, spouseOf, childrenOf } = buildLineageTree(members);
        container.innerHTML = `
          <div class="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-3 shadow-xs">
            <div class="flex items-center justify-between gap-2">
              <label class="text-xs font-bold text-slate-700">Household:</label>
              <select id="lineage-house-select" class="flex-1 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5">
                ${houseKeys.map(k => {
                  const [w, h] = k.split('::');
                  return `<option value="${k}" ${k === activeKey ? 'selected' : ''}>Ward ${w} · ${h} (${houses.get(k).length})</option>`;
                }).join('')}
              </select>
            </div>
            <div class="space-y-2.5">
              ${finalRoots.map(root => {
                const spouses = spouseOf.get(root.gp) || [];
                const kids = childrenOf.get(root.gp) || [];
                return `
                  <div class="border border-indigo-200 rounded-xl p-3 bg-indigo-50/40 space-y-2">
                    <div class="flex items-center gap-2.5">
                      ${photoTag(root.gp, 'w-9 h-11 rounded-lg object-cover border border-indigo-200 shrink-0')}
                      <div class="flex-1 min-w-0">
                        <span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-600 text-white">Head / Elder</span>
                        <div class="text-sm font-bold text-slate-900">${root.name}</div>
                        <div class="text-xs text-slate-600">${root.age}y · ${root.gender} · GP #${root.gp}</div>
                      </div>
                      <button type="button" data-open-gp="${root.gp}" class="text-xs font-bold text-indigo-700">Open</button>
                    </div>
                    ${spouses.map(sp => `
                      <div class="ml-4 pl-3 border-l-2 border-pink-300 flex items-center gap-2 text-xs">
                        ${photoTag(sp.gp, 'w-7 h-9 rounded object-cover shrink-0')}
                        <div class="flex-1"><span class="font-bold text-pink-700">Spouse:</span> <span class="font-semibold text-slate-900">${sp.name}</span> (${sp.age}y · #${sp.gp})</div>
                        <button type="button" data-open-gp="${sp.gp}" class="font-bold text-indigo-700">Open</button>
                      </div>
                    `).join('')}
                    ${kids.map(k => `
                      <div class="ml-4 pl-3 border-l-2 border-emerald-400 flex items-center gap-2 text-xs">
                        ${photoTag(k.gp, 'w-7 h-9 rounded object-cover shrink-0')}
                        <div class="flex-1"><span class="font-bold text-emerald-700">Next Gen:</span> <span class="font-semibold text-slate-900">${k.name}</span> (${k.age}y · ${k.gender} · #${k.gp})</div>
                        <button type="button" data-open-gp="${k.gp}" class="font-bold text-indigo-700">Open</button>
                      </div>
                    `).join('')}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      } else {
        const combos = computeCombinations();
        if (combos.length === 0) {
          container.innerHTML = `<div class="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-500">No unmerged house-number variants detected in this ward.</div>`;
          return;
        }
        container.innerHTML = combos.map(c => {
          const targetHouse = c.variants[0].house;
          const variantHouses = c.variants.slice(1).map(v => v.house);
          return `
            <div class="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2.5 shadow-xs">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-indigo-700">Ward ${c.ward} · Possible Same Household</span>
                <span class="text-[11px] text-slate-500">${c.variants.length} house variants</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                ${c.variants.map(vr => `
                  <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                    <div class="font-extrabold text-slate-900">House: ${vr.house} (${vr.members.length})</div>
                    <div class="text-slate-600 mt-1 space-y-0.5">
                      ${vr.members.slice(0, 4).map(m => `<div>#${m.gp} ${m.name} (${m.age}y)</div>`).join('')}
                      ${vr.members.length > 4 ? `<div class="text-slate-400">+${vr.members.length - 4} more</div>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
              <div class="flex items-center gap-2">
                <button type="button" data-merge-ward="${c.ward}" data-merge-target="${targetHouse}" data-merge-variants='${JSON.stringify(variantHouses)}' class="flex-1 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700">
                  Confirm Merge into ${targetHouse}
                </button>
                <button type="button" data-dismiss-combo="${c.key}" class="px-4 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200">
                  Keep Separate
                </button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    function openSlipModal(gp) {
      const v = state.voters.find(x => x.gp === gp);
      if (!v) return;
      const c = getCamp(v.gp);
      const modal = document.getElementById('slip-modal');
      document.getElementById('modal-title').textContent = `GP #${v.gp} · Ward ${v.ward}`;
      document.getElementById('slip-modal-body').innerHTML = `
        <!-- Paper Slip Preview with Photo -->
        <div class="slip-paper rounded-xl p-3 space-y-2 text-xs">
          <div class="flex items-center justify-between border-b border-slate-300 pb-1.5">
            <div>గ్రా.పం.ఓ.జా.వ.సం. <span class="px-1.5 py-0.5 border border-slate-800 font-extrabold text-sm">${v.gp}</span></div>
            <div class="font-semibold">అ.ఓ.జా.వ.సం. <span class="font-bold">${v.asm}</span></div>
          </div>
          <div class="flex gap-3 items-start">
            <div class="flex-1 grid grid-cols-2 gap-y-1 text-xs">
              <div class="text-slate-500">ఓటరు పేరు:</div><div class="font-bold text-slate-900">${v.name}</div>
              <div class="text-slate-500">${v.relType}:</div><div class="font-semibold text-slate-800">${v.relName}</div>
              <div class="text-slate-500">వయస్సు / లింగము:</div><div class="font-semibold">${v.age} · ${v.gender}</div>
              <div class="text-slate-500">ఇంటి సంఖ్య:</div><div class="font-bold text-indigo-700">${v.house}</div>
              <div class="text-slate-500">EPIC ID:</div><div class="font-mono font-bold">${v.epic}</div>
            </div>
            ${photoTag(v.gp, 'w-16 h-20 rounded-lg object-cover border border-slate-300 shrink-0')}
          </div>
        </div>

        <!-- Campaign Tracking Form -->
        <div class="space-y-3 text-xs">
          <div>
            <div class="font-bold text-slate-700 mb-1.5">1. Delivery & Contact</div>
            <div class="grid grid-cols-3 gap-1.5">
              <button type="button" id="m-del" class="py-2 px-2 rounded-xl font-bold border ${c.delivered ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300'}">
                ${c.delivered ? '✓ Delivered' : 'Slip Delivered'}
              </button>
              <button type="button" id="m-phone" class="py-2 px-2 rounded-xl font-bold border ${c.phone ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}">
                ${c.phone ? '✓ Phone' : '📞 Phone'}
              </button>
              <button type="button" id="m-person" class="py-2 px-2 rounded-xl font-bold border ${c.person ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-300'}">
                ${c.person ? '✓ In Person' : '🤝 In Person'}
              </button>
            </div>
          </div>

          <div>
            <div class="font-bold text-slate-700 mb-1.5">2. Voter Leaning / Support</div>
            <div class="grid grid-cols-4 gap-1.5">
              <button type="button" data-sup="pro" class="sup-btn py-2 rounded-xl font-bold border ${c.support==='pro' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300'}">Pro</button>
              <button type="button" data-sup="swing" class="sup-btn py-2 rounded-xl font-bold border ${c.support==='swing' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-700 border-slate-300'}">Swing</button>
              <button type="button" data-sup="against" class="sup-btn py-2 rounded-xl font-bold border ${c.support==='against' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-700 border-slate-300'}">Against</button>
              <button type="button" data-sup="unknown" class="sup-btn py-2 rounded-xl font-bold border ${c.support==='unknown' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-300'}">Unset</button>
            </div>
            <input id="m-wish" type="text" value="${(c.wish || '').replace(/"/g, '&quot;')}" placeholder="Wish / Request to grant (if Swing / Middle)..." class="w-full mt-2 px-3 py-2 border border-slate-300 rounded-xl" />
          </div>

          <div>
            <div class="font-bold text-slate-700 mb-1.5">3. Location & Bus Ticket</div>
            <div class="grid grid-cols-2 gap-1.5">
              <button type="button" data-loc="in_village" class="loc-btn py-2 rounded-xl font-bold border ${c.location==='in_village' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}">In Village</button>
              <button type="button" data-loc="outside" class="loc-btn py-2 rounded-xl font-bold border ${c.location==='outside' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-700 border-slate-300'}">Outside Village</button>
            </div>
            <div id="m-outside-box" class="${c.location==='outside' ? '' : 'hidden'} mt-2 p-2.5 rounded-xl bg-sky-50 border border-sky-200 space-y-2">
              <div class="grid grid-cols-3 gap-1.5">
                <button type="button" data-tkt="none" class="tkt-btn py-1.5 rounded-lg font-bold border ${c.ticket==='none' ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-300'}">No Ticket</button>
                <button type="button" data-tkt="promised" class="tkt-btn py-1.5 rounded-lg font-bold border ${c.ticket==='promised' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}">Promised</button>
                <button type="button" data-tkt="sent" class="tkt-btn py-1.5 rounded-lg font-bold border ${c.ticket==='sent' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300'}">Ticket Sent</button>
              </div>
              <input id="m-city" type="text" value="${(c.city || '').replace(/"/g, '&quot;')}" placeholder="City / Location (e.g. Hyderabad, Vijayawada)..." class="w-full px-2.5 py-1.5 border border-sky-300 rounded-lg bg-white" />
            </div>
          </div>

          <div class="border-t border-slate-200 pt-2.5">
            <div class="font-bold text-slate-700 mb-1">4. Segregate to Separate House / Living Unit</div>
            <p class="text-[11px] text-slate-500 mb-1.5">If they share House ${v.house} on paper but live separately, enter a unit name (e.g. "${v.house} (Unit 2)"):</p>
            <div class="flex gap-1.5">
              <input id="m-unit" type="text" value="${(c.unit || '').replace(/"/g, '&quot;')}" placeholder="${v.house} (Unit 2)" class="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg" />
              <button type="button" id="m-save-notes" class="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-bold">Save</button>
            </div>
          </div>
        </div>
      `;
      modal.classList.remove('hidden');

      document.getElementById('m-del').onclick = () => { setCamp(v.gp, { delivered: !getCamp(v.gp).delivered }); openSlipModal(v.gp); renderAll(); };
      document.getElementById('m-phone').onclick = () => { setCamp(v.gp, { phone: !getCamp(v.gp).phone }); openSlipModal(v.gp); renderAll(); };
      document.getElementById('m-person').onclick = () => { setCamp(v.gp, { person: !getCamp(v.gp).person }); openSlipModal(v.gp); renderAll(); };

      document.querySelectorAll('.sup-btn').forEach(b => b.onclick = () => {
        setCamp(v.gp, { support: b.dataset.sup });
        openSlipModal(v.gp); renderAll();
      });
      document.querySelectorAll('.loc-btn').forEach(b => b.onclick = () => {
        setCamp(v.gp, { location: b.dataset.loc });
        openSlipModal(v.gp); renderAll();
      });
      document.querySelectorAll('.tkt-btn').forEach(b => b.onclick = () => {
        setCamp(v.gp, { ticket: b.dataset.tkt });
        openSlipModal(v.gp); renderAll();
      });
      document.getElementById('m-save-notes').onclick = () => {
        const wish = document.getElementById('m-wish').value.trim();
        const cityEl = document.getElementById('m-city');
        const city = cityEl ? cityEl.value.trim() : '';
        const unit = document.getElementById('m-unit').value.trim();
        setCamp(v.gp, { wish, city, unit });
        showToast('Saved voter details');
        modal.classList.add('hidden');
        renderAll();
      };
    }

    function openAddModal() {
      const modal = document.getElementById('slip-modal');
      document.getElementById('modal-title').textContent = 'Add New Voter Slip';
      const defaultWard = state.selectedWard === 'all' ? 1 : state.selectedWard;
      const nextGp = Math.max(...state.voters.map(v => v.gp)) + 1;
      document.getElementById('slip-modal-body').innerHTML = `
        <form id="add-slip-form" class="space-y-2.5 text-xs">
          <div class="grid grid-cols-2 gap-2">
            <div><label class="font-bold text-slate-600">Ward (1-7)</label><input name="ward" type="number" min="1" max="14" value="${defaultWard}" required class="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg" /></div>
            <div><label class="font-bold text-slate-600">GP Serial</label><input name="gp" type="number" value="${nextGp}" required class="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg" /></div>
          </div>
          <div><label class="font-bold text-slate-600">Voter Name</label><input name="name" required class="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg" /></div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="font-bold text-slate-600">Relation</label><select name="relType" class="w-full mt-1 px-2 py-2 border border-slate-300 rounded-lg"><option value="తండ్రి">తండ్రి</option><option value="భర్త">భర్త</option><option value="తల్లి">తల్లి</option></select></div>
            <div class="col-span-2"><label class="font-bold text-slate-600">Relation Name</label><input name="relName" required class="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg" /></div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div><label class="font-bold text-slate-600">Age</label><input name="age" type="number" min="18" max="120" value="30" required class="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg" /></div>
            <div><label class="font-bold text-slate-600">Gender</label><select name="gender" class="w-full mt-1 px-2 py-2 border border-slate-300 rounded-lg"><option value="పు">పు</option><option value="స్త్రీ">స్త్రీ</option></select></div>
            <div><label class="font-bold text-slate-600">House No.</label><input name="house" required class="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg" /></div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="font-bold text-slate-600">Asm Serial</label><input name="asm" placeholder="104-37-..." class="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg" /></div>
            <div><label class="font-bold text-slate-600">EPIC ID</label><input name="epic" placeholder="YQO..." class="w-full mt-1 px-2.5 py-2 border border-slate-300 rounded-lg" /></div>
          </div>
          <button type="submit" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700">Save Voter Slip</button>
        </form>
      `;
      modal.classList.remove('hidden');
      document.getElementById('add-slip-form').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const nv = {
          gp: Number(fd.get('gp')), ward: Number(fd.get('ward')),
          asm: (fd.get('asm') || '').toString().trim(),
          name: (fd.get('name') || '').toString().trim(),
          relType: fd.get('relType'), relName: (fd.get('relName') || '').toString().trim(),
          age: Number(fd.get('age')), gender: fd.get('gender'),
          house: (fd.get('house') || '').toString().trim(),
          epic: (fd.get('epic') || '').toString().trim().toUpperCase(),
          custom: true
        };
        const idx = state.voters.findIndex(x => x.gp === nv.gp);
        if (idx >= 0) state.voters[idx] = nv;
        else state.voters.push(nv);
        saveState();
        modal.classList.add('hidden');
        showToast(`Saved GP #${nv.gp}`);
        renderAll();
      };
    }

    function updateFilterBadge() {
      let cnt = 0;
      if (state.fDelivery !== 'all') cnt++;
      if (state.fContact !== 'all') cnt++;
      if (state.fSupport !== 'all') cnt++;
      if (state.fLocation !== 'all') cnt++;
      const b = document.getElementById('active-filter-badge');
      b.textContent = cnt;
      b.classList.toggle('hidden', cnt === 0);
    }

    function applyLanguage() {
      document.getElementById('app-title').textContent = t('title');
      document.getElementById('app-subtitle').textContent = t('subtitle');
      document.getElementById('lang-toggle').textContent = t('langBtn');
      document.getElementById('search-input').placeholder = t('searchPh');
      document.getElementById('nav-dashboard').textContent = t('navDash');
      document.getElementById('nav-families').textContent = t('navFamilies');
      document.getElementById('nav-serials').textContent = t('navSerials');
      document.getElementById('nav-intel').textContent = t('navIntel');
    }

    function renderAll() {
      applyLanguage();
      renderWardPills();
      updateFilterBadge();

      const dups = computeDuplicates(state.selectedWard === 'all' || state.crossWardDups).filter(d => !d.decision).length;
      document.getElementById('nav-alert-dot').classList.toggle('hidden', dups === 0);

      document.getElementById('list-controls').classList.toggle('hidden', state.activeTab === 'intel' || state.activeTab === 'dashboard');
      document.getElementById('intel-controls').classList.toggle('hidden', state.activeTab !== 'intel');

      document.querySelectorAll('.nav-tab').forEach(btn => {
        const active = btn.dataset.tab === state.activeTab;
        btn.classList.toggle('text-indigo-700', active);
        btn.classList.toggle('font-bold', active);
        btn.classList.toggle('text-slate-500', !active);
        btn.classList.toggle('font-medium', !active);
      });

      document.querySelectorAll('.intel-sub-btn').forEach(btn => {
        const active = btn.dataset.sub === state.intelSub;
        btn.classList.toggle('bg-white', active);
        btn.classList.toggle('text-indigo-700', active);
        btn.classList.toggle('shadow-sm', active);
        btn.classList.toggle('text-slate-600', !active);
      });

      if (state.activeTab === 'dashboard') renderDashboard();
      else if (state.activeTab === 'families') renderFamilies();
      else if (state.activeTab === 'serials') renderSerials();
      else renderIntel();

      if (window.lucide) lucide.createIcons();
    }

    document.addEventListener('DOMContentLoaded', () => {
      loadState();
      renderAll();
      if (fbConfig.url) {
        document.getElementById('fb-url-input').value = fbConfig.url;
        document.getElementById('fb-room-input').value = fbConfig.room || DEFAULT_ROOM;
        startLiveSync();
      } else {
        document.getElementById('fb-room-input').value = DEFAULT_ROOM;
      }

      document.getElementById('fb-connect-btn').addEventListener('click', () => {
        const u = cleanFbUrl(document.getElementById('fb-url-input').value);
        const rm = document.getElementById('fb-room-input').value.trim() || DEFAULT_ROOM;
        if (!u || !u.startsWith('https://')) { showToast('Enter a valid https:// Firebase URL'); return; }
        fbConfig = { url: u, room: rm };
        saveState();
        startLiveSync();
        showToast('Connecting to live database...');
      });

      document.getElementById('fb-disconnect-btn').addEventListener('click', () => {
        fbConfig = { url: '', room: DEFAULT_ROOM };
        clearInterval(syncTimer);
        saveState();
        updateSyncIndicator(false);
        showToast('Live sync disconnected');
      });

      document.getElementById('copy-team-link-btn').addEventListener('click', async () => {
        const base = window.location.href.split('?')[0];
        const shareUrl = `${base}?fb=${encodeURIComponent(fbConfig.url)}&room=${encodeURIComponent(fbConfig.room || DEFAULT_ROOM)}`;
        try {
          await navigator.clipboard.writeText(shareUrl);
          showToast('Copied team link! Share on WhatsApp');
        } catch (e) {
          showToast('Copy from address bar: ?fb=...');
        }
      });

      document.getElementById('lang-toggle').addEventListener('click', () => {
        state.lang = state.lang === 'en' ? 'te' : 'en';
        saveState(); renderAll();
      });

      document.getElementById('filter-toggle-btn').addEventListener('click', () => {
        document.getElementById('filter-drawer').classList.toggle('hidden');
      });

      ['f-delivery', 'f-contact', 'f-support', 'f-location'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
          if (id === 'f-delivery') state.fDelivery = e.target.value;
          if (id === 'f-contact') state.fContact = e.target.value;
          if (id === 'f-support') state.fSupport = e.target.value;
          if (id === 'f-location') state.fLocation = e.target.value;
          state.pageLimit = 50;
          renderAll();
        });
      });

      const searchInput = document.getElementById('search-input');
      const clearBtn = document.getElementById('clear-search');
      searchInput.addEventListener('input', () => {
        state.search = searchInput.value;
        state.pageLimit = 50;
        clearBtn.classList.toggle('hidden', !state.search);
        renderAll();
      });
      clearBtn.addEventListener('click', () => {
        searchInput.value = ''; state.search = '';
        clearBtn.classList.add('hidden'); renderAll();
      });

      document.getElementById('sort-select').addEventListener('change', (e) => {
        state.sortBy = e.target.value; renderAll();
      });

      document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          state.activeTab = btn.dataset.tab; state.pageLimit = 50; renderAll();
        });
      });

      document.querySelectorAll('.intel-sub-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          state.intelSub = btn.dataset.sub; renderAll();
        });
      });

      document.getElementById('cross-ward-toggle').addEventListener('change', (e) => {
        state.crossWardDups = e.target.checked; renderAll();
      });

      document.getElementById('load-more-btn').addEventListener('click', () => {
        state.pageLimit += 60; renderAll();
      });

      document.getElementById('content-area').addEventListener('click', (e) => {
        const tog = e.target.closest('[data-toggle-del]');
        if (tog) {
          const gp = Number(tog.dataset.toggleDel);
          setCamp(gp, { delivered: !getCamp(gp).delivered });
          renderAll(); return;
        }
        const open = e.target.closest('[data-open-gp]');
        if (open) { openSlipModal(Number(open.dataset.openGp)); return; }

        const famBtn = e.target.closest('[data-fam-gps]');
        if (famBtn) {
          const gps = JSON.parse(famBtn.dataset.famGps);
          const mark = famBtn.dataset.famDone === '1';
          gps.forEach(gp => setCamp(gp, { delivered: mark }));
          showToast(mark ? `Marked ${gps.length} slips delivered` : `Marked ${gps.length} slips pending`);
          renderAll(); return;
        }

        const linBtn = e.target.closest('[data-view-lineage]');
        if (linBtn) {
          state.activeTab = 'intel'; state.intelSub = 'lineage';
          state.selectedLineageHouse = linBtn.dataset.viewLineage;
          renderAll(); return;
        }

        const df = e.target.closest('[data-dash-filter]');
        if (df) {
          const k = df.dataset.dashFilter;
          state.fDelivery = 'all'; state.fContact = 'all'; state.fSupport = 'all'; state.fLocation = 'all';
          if (k === 'delivered') state.fDelivery = 'delivered';
          else if (k === 'phone') state.fContact = 'phone';
          else if (k === 'person') state.fContact = 'person';
          else if (['pro','swing','against','unknown'].includes(k)) state.fSupport = k;
          else if (['in_village','outside','ticket_yes','ticket_no'].includes(k)) state.fLocation = k;
          document.getElementById('f-delivery').value = state.fDelivery;
          document.getElementById('f-contact').value = state.fContact;
          document.getElementById('f-support').value = state.fSupport;
          document.getElementById('f-location').value = state.fLocation;
          state.activeTab = 'serials';
          renderAll(); return;
        }

        const jw = e.target.closest('[data-jump-ward]');
        if (jw) {
          state.selectedWard = Number(jw.dataset.jumpWard);
          state.activeTab = 'families';
          renderAll(); return;
        }

        const dupBtn = e.target.closest('[data-dup-key]');
        if (dupBtn) {
          state.dupDecisions[dupBtn.dataset.dupKey] = dupBtn.dataset.dupVal;
          saveState(); renderAll(); return;
        }

        const mergeBtn = e.target.closest('[data-merge-target]');
        if (mergeBtn) {
          const w = mergeBtn.dataset.mergeWard;
          const target = mergeBtn.dataset.mergeTarget;
          JSON.parse(mergeBtn.dataset.mergeVariants).forEach(vh => { state.mergedHouses[`${w}::${vh}`] = target; });
          saveState(); showToast(`Merged into ${target}`); renderAll(); return;
        }

        const disBtn = e.target.closest('[data-dismiss-combo]');
        if (disBtn) {
          state.dismissedCombos[disBtn.dataset.dismissCombo] = true;
          saveState(); renderAll();
        }
      });

      document.getElementById('content-area').addEventListener('change', (e) => {
        if (e.target && e.target.id === 'lineage-house-select') {
          state.selectedLineageHouse = e.target.value;
          renderIntel(); if (window.lucide) lucide.createIcons();
        }
      });

      document.getElementById('close-slip-modal').addEventListener('click', () => document.getElementById('slip-modal').classList.add('hidden'));
      document.getElementById('add-btn').addEventListener('click', openAddModal);
      document.getElementById('sync-btn').addEventListener('click', () => document.getElementById('sync-modal').classList.remove('hidden'));
      document.getElementById('close-sync-modal').addEventListener('click', () => document.getElementById('sync-modal').classList.add('hidden'));

      document.getElementById('export-json-btn').addEventListener('click', () => {
        const payload = {
          campaign: state.campaign, mergedHouses: state.mergedHouses,
          dismissedCombos: state.dismissedCombos, dupDecisions: state.dupDecisions,
          customVoters: state.voters.filter(v => v.custom)
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `dronadula-campaign-sync-${new Date().toISOString().slice(0,10)}.json`;
        a.click(); showToast('Exported JSON');
      });

      document.getElementById('export-csv-btn').addEventListener('click', () => {
        const rows = [['GP_Serial','Ward','Asm_Serial','Name','RelType','RelName','Age','Gender','House','Living_Unit','EPIC','Delivered','Phone','In_Person','Support','Wish','Location','Ticket','City']];
        getWardVoters().forEach(v => {
          const c = getCamp(v.gp);
          rows.push([v.gp, v.ward, v.asm, v.name, v.relType, v.relName, v.age, v.gender, v.house, c.unit, v.epic,
            c.delivered?'Yes':'No', c.phone?'Yes':'No', c.person?'Yes':'No', c.support, c.wish, c.location, c.ticket, c.city]);
        });
        const csv = '\uFEFF' + rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `dronadula-ward-${state.selectedWard}.csv`;
        a.click(); showToast('Exported CSV');
      });

      document.getElementById('import-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            Object.assign(state.campaign, data.campaign || {});
            Object.assign(state.mergedHouses, data.mergedHouses || {});
            Object.assign(state.dismissedCombos, data.dismissedCombos || {});
            Object.assign(state.dupDecisions, data.dupDecisions || {});
            saveState(); showToast('Merged JSON sync'); renderAll();
          } catch (err) { showToast('Invalid JSON file'); }
        };
        reader.readAsText(file);
      });

      document.getElementById('reset-progress-btn').addEventListener('click', () => {
        state.campaign = {}; state.mergedHouses = {}; state.dismissedCombos = {}; state.dupDecisions = {};
        saveState(); document.getElementById('sync-modal').classList.add('hidden');
        showToast('Cleared tracking marks'); renderAll();
      });
    });
  
