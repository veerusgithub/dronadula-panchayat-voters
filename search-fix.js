// search-fix.js — Reliable Bilingual (English + Telugu + Phonetic) Search for Dronadula Panchayat Voters
(function () {
  'use strict';

  const TE_INDEP_VOWELS = {
    'అ':'a','ఆ':'aa','ఇ':'i','ఈ':'ee','ఉ':'u','ఊ':'oo','ఋ':'ru','ౠ':'ru',
    'ఎ':'e','ఏ':'e','ఐ':'ai','ఒ':'o','ఓ':'o','ఔ':'au'
  };
  const TE_CONSONANTS = {
    'క':'k','ఖ':'kh','గ':'g','ఘ':'gh','ఙ':'ng',
    'చ':'ch','ఛ':'chh','జ':'j','ఝ':'jh','ఞ':'ny',
    'ట':'t','ఠ':'th','డ':'d','ఢ':'dh','ణ':'n',
    'త':'t','థ':'th','ద':'d','ధ':'dh','న':'n',
    'ప':'p','ఫ':'ph','బ':'b','భ':'bh','మ':'m',
    'య':'y','ర':'r','ఱ':'r','ల':'l','ళ':'l','వ':'v',
    'శ':'sh','ష':'sh','స':'s','హ':'h'
  };
  const TE_MATRAS = {
    'ా':'aa','ి':'i','ీ':'ee','ు':'u','ూ':'oo','ృ':'ru','ౄ':'ru',
    'ె':'e','ే':'e','ై':'ai','ొ':'o','ో':'o','ౌ':'au'
  };
  const TE_VIRAMA = '్';

  window.teToLatin = function (str) {
    if (!str) return '';
    let out = '';
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (TE_INDEP_VOWELS[ch]) {
        out += TE_INDEP_VOWELS[ch];
      } else if (TE_CONSONANTS[ch]) {
        if (ch === 'క' && s[i + 1] === TE_VIRAMA && s[i + 2] === 'ష') {
          out += 'ksh';
          i += 2;
          const nxt = s[i + 1];
          if (nxt === TE_VIRAMA) { i++; }
          else if (TE_MATRAS[nxt]) { out += TE_MATRAS[nxt]; i++; }
          else { out += 'a'; }
          continue;
        }
        if (ch === 'శ' && s[i + 1] === TE_VIRAMA && s[i + 2] === 'ర' && (s[i + 3] === 'ీ' || s[i + 3] === 'ి')) {
          out += 'sri';
          i += 3;
          continue;
        }
        out += TE_CONSONANTS[ch];
        const nxt = s[i + 1];
        if (nxt === TE_VIRAMA) { i++; }
        else if (TE_MATRAS[nxt]) { out += TE_MATRAS[nxt]; i++; }
        else { out += 'a'; }
      } else if (TE_MATRAS[ch]) {
        out += TE_MATRAS[ch];
      } else if (ch === 'ం' || ch === 'ఁ') {
        const nxt = s[i + 1] || '';
        out += (nxt === 'ప' || nxt === 'ఫ' || nxt === 'బ' || nxt === 'భ' || nxt === 'మ' || !nxt || /\s/.test(nxt)) ? 'm' : 'n';
      } else if (ch === 'ః') {
        out += 'h';
      } else if (ch !== TE_VIRAMA) {
        out += ch.toLowerCase();
      }
    }
    return out.toLowerCase();
  };

  window.phoneticNorm = function (str) {
    if (!str) return '';
    let s = window.teToLatin(str).toLowerCase();
    s = s.replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/aa/g, 'a').replace(/ai/g, 'e').replace(/au/g, 'o');
    s = s.replace(/ksh/g, 'x').replace(/krush/g, 'kris').replace(/krish/g, 'kris')
      .replace(/srush/g, 'sris').replace(/srish/g, 'sris')
      .replace(/rao/g, 'rav').replace(/ravu/g, 'rav')
      .replace(/shaik|sheik|shaikh|sek/g, 'sek')
      .replace(/chh/g, 'c').replace(/ch/g, 'c').replace(/sh/g, 's')
      .replace(/ph/g, 'p').replace(/bh/g, 'b').replace(/dh/g, 'd')
      .replace(/th/g, 't').replace(/kh/g, 'k').replace(/gh/g, 'g')
      .replace(/jh/g, 'j').replace(/f/g, 'p').replace(/w/g, 'v')
      .replace(/z/g, 'j').replace(/q/g, 'k').replace(/y/g, 'i')
      .replace(/([a-z])\1+/g, '$1')
      .replace(/([a-z]{3,})a\b/g, '$1');
    return s.replace(/[^a-z0-9\s\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
  };

  window.phoneticNoSchwa = function (phon) {
    return (phon || '').replace(/[\sa]/g, '');
  };

  window.ensureSearchIndex = function (v) {
    if (v._sIdxV2) return v._sIdxV2;
    const raw = `${v.gp} ${v.asm || ''} ${v.name || ''} ${v.relName || ''} ${v.house || ''} ${v.epic || ''}`.toLowerCase();
    const lat = window.teToLatin(`${v.name || ''} ${v.relName || ''}`);
    const phon = window.phoneticNorm(`${v.name || ''} ${v.relName || ''}`);
    v._sIdxV2 = {
      raw,
      rawCompact: raw.replace(/\s+/g, ''),
      lat,
      latCompact: lat.replace(/\s+/g, ''),
      phon,
      phonCompact: phon.replace(/\s+/g, ''),
      phonNoA: window.phoneticNoSchwa(phon)
    };
    return v._sIdxV2;
  };

  window.matchesAllCriteria = function (v) {
    const c = getCamp(v.gp);
    const q = (state.search || '').trim().toLowerCase();
    if (q) {
      const idx = window.ensureSearchIndex(v);
      const extra = `${c.unit || ''} ${c.wish || ''} ${c.city || ''}`.toLowerCase();
      const extraPhon = extra.trim() ? window.phoneticNorm(extra) : '';
      const tokens = q.split(/\s+/).filter(Boolean);
      const ok = tokens.every(tok => {
        if (idx.raw.includes(tok) || idx.rawCompact.includes(tok) || extra.includes(tok)) return true;
        const tokLat = window.teToLatin(tok);
        const tokLatC = tokLat.replace(/\s+/g, '');
        if (tokLat && (idx.lat.includes(tokLat) || idx.latCompact.includes(tokLatC))) return true;
        const tokPhon = window.phoneticNorm(tok);
        const tokPhonC = tokPhon.replace(/\s+/g, '');
        const tokNoA = window.phoneticNoSchwa(tokPhon);
        if (tokPhon && (
          idx.phon.includes(tokPhon) ||
          idx.phonCompact.includes(tokPhonC) ||
          (tokNoA.length >= 3 && idx.phonNoA.includes(tokNoA)) ||
          (extraPhon && extraPhon.includes(tokPhon))
        )) return true;
        return false;
      });
      if (!ok) return false;
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
  };
})();
