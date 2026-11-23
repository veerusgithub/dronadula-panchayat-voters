# Dronadula Panchayat Voters — Requirements & Architecture

**App Name (Telugu):** ద్రోణాదుల పంచాయతీ ఓటర్లు  
**Repository:** `https://github.com/veerusgithub/dronadula-panchayat-voters` (`main` branch)  
**Live Site:** `https://veerusgithub.github.io/dronadula-panchayat-voters/`  
**Firebase Realtime Database:** `https://voter-list-17964-default-rtdb.firebaseio.com` (Room: `dronadula_main`)  
**Dataset:** 104-Parchur Assembly, Martur Mandal, Bapatla District — **14 Wards, 5,655 Voters** (East Wards 1–7: 2,821; West Wards 8–14: 2,834), **5,652 WebP Photos**.

## Modular File Structure
- `index.html`: App shell loading data modules, `app.js`, and modular scripts (`search-fix.js?v=3`, `features-v3.js?v=3`, `auth-admin.js?v=4`, `contestants-info.js?v=2`).
- `search-fix.js`: Bilingual English + Telugu + phonetic search including relation name/type (`father`/`husband`/`mother`/`తండ్రి`/`భర్త`/`తల్లి`), city, deceased, autoNeeded, and ward privacy masking.
- `features-v3.js`: Auto-connected bidirectional Firebase sync, per-user audit logging (`updatedBy` + `auditLog`), Admin 5,655-voter Firebase backup, Deceased / Outside Village / Outside Country + City / Election-Day Auto Needed fields, compact mobile ward dropdown, and ward-level campaign visibility masking.
- `auth-admin.js`: Mandatory login gate blocking app until signed in, self-service New User Sign Up + Admin (`veerusgithub`) approval workflow & ward mapping.
- `contestants-info.js`: Village President (Sarpanch) & Ward 1–14 contestants with symbols synced to Firebase.

## Implemented Requirements Checklist
1. Auto-Firebase sync & zero data loss + Admin 5,655-voter Firebase backup.
2. Self-service user signup + Admin (`veerusgithub`) approval & ward assignment.
3. Deceased voter option + badge + filter.
4. Outside Village & Outside Country options with City/Country input.
5. Election-day Auto Needed option + pickup note + filter + count.
6. Search by relation name and relation type.
7. Ward (1–14) & Village President (Sarpanch) contestants with symbols.
8. Compact mobile single-row Ward dropdown selector.
9. Bidirectional phone localStorage rescue sync + per-user audit log.
10. Mandatory login gate; Admin sees all wards' campaign marks; team members edit only their mapped ward and see read-only basic voter info in other wards.
11. Living `REQUIREMENTS.md` tracked in repository.
12. Bus Needed & Auto Needed counts on Dashboard with one-tap filtering, plus Bus/Auto/Deceased quick filters in the ward bar.
13. Phone number input & tap-to-call links for each voter (`voterPhone`, searchable) and each Village President / Ward contestant (`phone`), plus compact non-sticky header with multi-row ward pills hidden on all screens.
