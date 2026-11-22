// enhancer.js — Phonetic English/Telugu Name Search + Full English Translation
(function () {
  const VOWELS = {
    'అ': 'a', 'ఆ': 'aa', 'ఇ': 'i', 'ఈ': 'ee', 'ఉ': 'u', 'ఊ': 'oo',
    'ఋ': 'ru', 'ఎ': 'e', 'ఏ': 'e', 'ఐ': 'ai', 'ఒ': 'o', 'ఓ': 'o', 'ఔ': 'au'
  };
  const MATRAS = {
    'ా': 'a', 'ి': 'i', 'ీ': 'ee', 'ు': 'u', 'ూ': 'oo', 'ృ': 'ru',
    'ె': 'e', 'ే': 'e', 'ై': 'ai', 'ొ': 'o', 'ో': 'o', 'ౌ': 'au', '్': ''
  };
  const CONSONANTS = {
    'క': 'k', 'ఖ': 'kh', 'గ': 'g', 'ఘ': 'gh', 'ఙ': 'ng',
    'చ': 'ch', 'ఛ': 'chh', 'జ': 'j', 'ఝ': 'jh', 'ఞ': 'ny',
    'ట': 't', 'ఠ': 'th', 'డ': 'd', 'ఢ': 'dh', 'ణ': 'n',
    'త': 't', 'థ': 'th', 'ద': 'd', 'ధ': 'dh', 'న': 'n',
    'ప': 'p', 'ఫ': 'ph', 'బ': 'b', 'భ': 'bh', 'మ': 'm',
    'య': 'y', 'ర': 'r', 'ఱ': 'r', 'ల': 'l', 'ళ': 'l',
    'వ': 'v', 'శ': 'sh', 'ష': 'sh', 'స': 's', 'హ': 'h'
  };
  const SIGNS = { 'ం': 'm', 'ః': 'h', 'ఁ': 'n' };

  function cleanTe(s) {
    if (!s) return '';
    return String(s)
      .replace(/శ్వ\s+ర్లు/g, 'శ్వర్లు')
      .replace(/శ్వ\s+ర/g, 'శ్వర')
      .replace(/చ్చ\s+య్య/g, 'చ్చయ్య')
      .replace(/న్న\s+య్య/g, 'న్నయ్య')
      .replace(/మ్మ\s+య్య/g, 'మ్మయ్య')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function teWordToEn(word) {
    if (!word) return '';
    if (!/[\u0C00-\u0C7F]/.test(word)) return word;
    let out = '';
    const chars = Array.from(word);
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (VOWELS[ch] !== undefined) {
        out += VOWELS[ch];
      } else if (CONSONANTS[ch] !== undefined) {
        const next = chars[i + 1];
        if (next && MATRAS[next] !== undefined) {
          out += CONSONANTS[ch] + MATRAS[next];
          i++;
        } else {
          out += CONSONANTS[ch] + 'a';
        }
      } else if (SIGNS[ch] !== undefined) {
        const next = chars[i + 1];
        if (ch === 'ం' && next && 'కఖగఘచఛజఝటఠడఢతథదధన'.includes(next)) {
          out += 'n';
        } else {
          out += SIGNS[ch];
        }
      } else if (MATRAS[ch] !== undefined) {
        out += MATRAS[ch];
      } else {
        out += ch;
      }
    }
    out = out
      .replace(/shree/g, 'sri')
      .replace(/shri/g, 'sri')
      .replace(/krushna/g, 'krishna')
      .replace(/eshva/g, 'eswa')
      .replace(/raavu$/i, 'rao')
      .replace(/ravu$/i, 'rao')
      .replace(/raao$/i, 'rao')
      .replace(/ayya$/i, 'aiah')
      .replace(/selph$/i, 'self');
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  function teToEn(str) {
    const cleaned = cleanTe(str);
    if (!cleaned) return '';
    return cleaned.split(/\s+/).map(teWordToEn).join(' ');
  }

  function phNorm(str) {
    if (!str) return '';
    let s = String(str).toLowerCase();
    if (/[\u0C00-\u0C7F]/.test(s)) s = teToEn(s).toLowerCase();
    return s
      .replace(/[^a-z0-9]/g, '')
      .replace(/x/g, 'ks')
      .replace(/ph/g, 'f')
      .replace(/bh/g, 'b')
      .replace(/dh/g, 'd')
      .replace(/th/g, 't')
      .replace(/kh/g, 'k')
      .replace(/gh/g, 'g')
      .replace(/sh/g, 's')
      .replace(/ch/g, 'c')
      .replace(/w/g, 'v')
      .replace(/z/g, 'j')
      .replace(/krusna/g, 'krisna')
      .replace(/ee|ea|ie|ei|y/g, 'i')
      .replace(/oo|ou/g, 'u')
      .replace(/aa/g, 'a')
      .replace(/rao/g, 'ravu')
      .replace(/aiah|aya/g, 'aya')
      .replace(/(.)\1+/g, '$1');
  }

  const REL_EN = { 'తండ్రి': 'Father', 'భర్త': 'Husband', 'తల్లి': 'Mother', 'ఇతరులు': 'Other', 'సంబంధం': 'Relation' };
  const GEN_EN = { 'పు': 'Male', 'స్త్రీ': 'Female', 'ఇతరులు': 'Other' };
  const UI_EN = [
    ['గ్రా.పం.ఓ.జా.వ.సం.', 'GP Serial'],
    ['అ.ఓ.జా.వ.సం.', 'Asm Serial'],
    ['ఓటరు పేరు:', 'Voter Name:'],
    ['వయస్సు / లింగము:', 'Age / Gender:'],
    ['ఇంటి సంఖ్య:', 'House No.:'],
    ['తండ్రి:', 'Father:'],
    ['భర్త:', 'Husband:'],
    ['తల్లి:', 'Mother:'],
    ['ఇతరులు:', 'Other:'],
    ['సంబంధం:', 'Relation:'],
    ['పు', 'Male'],
    ['స్త్రీ', 'Female']
  ];

  function enrichVoters() {
    if (!window.state || !Array.isArray(state.voters)) return;
    state.voters.forEach(v => {
      if (v._enriched) return;
      v.name = cleanTe(v.name);
      v.relName = cleanTe(v.relName);
      v.nameEn = teToEn(v.name);
      v.relNameEn = teToEn(v.relName);
      v._searchAll = [
        v.gp, v.asm, v.name, v.nameEn, v.relName, v.relNameEn, v.house, v.epic
      ].join(' ').toLowerCase();
      v._phName = phNorm(v.nameEn);
      v._phRel = phNorm(v.relNameEn);
      v._enriched = true;
    });
  }

  function dispName(v) {
    return (state.lang === 'en' && v.nameEn) ? v.nameEn : (v.name || '');
  }
  function dispRelType(v) {
    return (state.lang === 'en') ? (REL_EN[v.relType] || teToEn(v.relType)) : (v.relType || '');
  }
  function dispRelName(v) {
    return (state.lang === 'en' && v.relNameEn) ? v.relNameEn : (v.relName || '');
  }
  function dispGender(v) {
    return (state.lang === 'en') ? (GEN_EN[v.gender] || teToEn(v.gender)) : (v.gender || '');
  }

  function translateElementTelugu(root) {
    if (!root || state.lang !== 'en') return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.nodeValue;
      if (!txt || !/[\u0C00-\u0C7F]/.test(txt)) continue;
      if (node.parentElement && node.parentElement.id === 'lang-toggle') continue;
      let out = txt;
      for (const [te, en] of UI_EN) {
        if (out.includes(te)) out = out.split(te).join(en);
      }
      if (/[\u0C00-\u0C7F]/.test(out)) {
        out = out.replace(/[\u0C00-\u0C7F]+(?:\s+[\u0C00-\u0C7F]+)*/g, m => teToEn(m));
      }
      if (out !== txt) node.nodeValue = out;
    }
  }

  function installEnhancer() {
    if (typeof window.matchesAllCriteria !== 'function') return;
    enrichVoters();

    if (typeof I18N !== 'undefined' && I18N.en) {
      I18N.en.title = 'Dronadula Panchayat Voters';
      I18N.en.searchPh = 'Search Name (English / తెలుగు), GP #, House, EPIC...';
    }

    const origMatches = window.matchesAllCriteria;
    window.matchesAllCriteria = function (v) {
      if (!v._enriched) enrichVoters();
      const q = (state.search || '').trim();
      if (q) {
        const c = getCamp(v.gp);
        const ql = q.toLowerCase();
        const extra = ((c.unit || '') + ' ' + (c.wish || '') + ' ' + (c.city || '')).toLowerCase();
        const haystack = v._searchAll + ' ' + extra;

        let hit = haystack.includes(ql);
        if (!hit) {
          const tokens = ql.split(/\s+/).filter(Boolean);
          hit = tokens.every(tok => {
            if (haystack.includes(tok)) return true;
            const ptok = phNorm(tok);
            return ptok.length >= 2 && (v._phName.includes(ptok) || v._phRel.includes(ptok));
          });
        }
        if (!hit) return false;
      }
      const savedSearch = state.search;
      state.search = '';
      const ok = origMatches(v);
      state.search = savedSearch;
      return ok;
    };

    const origRenderRow = window.renderVoterRow;
    window.renderVoterRow = function (v) {
      if (!v._enriched) enrichVoters();
      if (state.lang !== 'en') return origRenderRow(v);
      const clone = {
        ...v,
        name: dispName(v),
        relType: dispRelType(v),
        relName: dispRelName(v),
        gender: dispGender(v)
      };
      return origRenderRow(clone);
    };

    const origOpenSlip = window.openSlipModal;
    window.openSlipModal = function (gp) {
      origOpenSlip(gp);
      if (state.lang === 'en') {
        translateElementTelugu(document.getElementById('slip-modal'));
      }
    };

    const origRenderAll = window.renderAll;
    window.renderAll = function () {
      enrichVoters();
      origRenderAll();
      if (state.lang === 'en') {
        translateElementTelugu(document.getElementById('content-area'));
        translateElementTelugu(document.getElementById('filter-drawer'));
      }
    };

    window.renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(installEnhancer, 0));
  } else {
    setTimeout(installEnhancer, 0);
  }
})();
