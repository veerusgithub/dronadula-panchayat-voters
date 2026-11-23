# Dronadula Panchayat Voters — Requirements & Architecture

## Live App & Repository
- **GitHub Repository:** `https://github.com/veerusgithub/dronadula-panchayat-voters` (Owner/Admin: `veerusgithub`, Branch: `main`)
- **Live Site (GitHub Pages):** `https://veerusgithub.github.io/dronadula-panchayat-voters/`
- **Firebase Realtime Database:** `https://voter-list-17964-default-rtdb.firebaseio.com` (Room: `dronadula_main`)
- **App Display Name (Telugu):** `ద్రోణాదుల పంచాయతీ ఓటర్లు` (README & docs in English)
- **Dataset:** 14 Wards, 5,655 Voters (East Wards 1–7: 2,821; West Wards 8–14: 2,834), 5,652 WebP photos.

## Modular File Structure (`main`)
- `index.html` — Entry shell loading modular data and JS scripts.
- `data/voters-east.js`, `data/voters-west.js`, `data/photos-w1.js`..`w14.js` — Voter and photo datasets.
- `app.js` — Core UI (Dashboard, Families, Serials, Lineage/Dups, English/Telugu toggle).
- `search-fix.js` — Bilingual English + Telugu phonetic search (`teToLatin`, `phoneticNorm`).
- `features-v2.js` — Enhanced duplicate detection (Name + Relation + Age + Canvas photo cross-check), auto Firebase sync (`PATCH` + timestamp merge), Ward Stats banner, Dashboard East/West & ward-wise summary.
- `auth-admin.js` — Login gate with `veerusgithub` as Admin (SHA-256 PIN) and Admin Panel.

## Completed Requirements
- [x] Merged East (Wards 1–7) and West (Wards 8–14) voter lists with top East/West filter and 14-ward selector.
- [x] Fixed bilingual English/Telugu phonetic search.
- [x] Enhanced duplicate detection (Name + Relation Name + Age + photo cross-check).
- [x] Added Login Gate with `veerusgithub` as Repo Owner Admin + Admin Panel.
- [x] Connected Firebase Realtime Database automatically (`https://voter-list-17964-default-rtdb.firebaseio.com`) with non-destructive `PATCH` sync.
- [x] Added Ward-wise statistics banner and East vs. West Dashboard breakdown.

## Active Enhancement Backlog
1. **Automatic Firebase Sync & Full Voter DB Seed:** Keep automatic Firebase connection without manual user setup; never lose data on redeployment; support uploading all 5,655 voters and their statuses into Firebase.
2. **User Self-Signup & Admin Approval:** Allow new team members to register/request access on the login screen; Admin (`veerusgithub`) reviews and approves/rejects pending sign-ins.
3. **Deceased Voter Status:** Add option to mark a voter as deceased (with filter and count).
4. **Outside Country + Outside Village + City/Country Field:** Support `In Village`, `Outside Village`, and `Outside Country`, with a city/location name input whenever `Outside Village` or `Outside Country` is selected.
5. **Election-Day Auto / Transport Flag:** Add an option to mark elderly/needy voters who require an auto on election day, with quick filtering to remember them.
6. **Search by Relation:** Extend search to match relation type (Father/Husband/Mother/తండ్రి/భర్త/తల్లి) alongside relation name.
7. **Ward Contestants & Village President Contestants:** Allow adding contestant names and symbols for each ward (Wards 1–14) as well as Village President (Sarpanch) contestants for the entire village.
8. **Mobile Header / Ward Selector Optimization:** Compact the mobile header and ward selector so it does not occupy 3/4 of the mobile viewport.
9. **Sync Existing Phone Local Data + User Audit Logging:** Automatically merge-push existing local phone data (`sliptrack_dronadula_v3`) into Firebase; on every edit, persist to both `localStorage` and Firebase and log who made the update (`updatedBy`, timestamp).
10. **Role-Based Visibility & Contestant Ward Mapping:** Map logged-in users to their assigned contestant/ward. Only Admin can see all wards' marked sensitive attributes (such as Pro/Swing/Against); non-admin users can view basic voter info while sensitive campaign attributes are restricted.
11. **Living Requirements Doc:** Keep `REQUIREMENTS.md` updated in the repository for continuity across sessions/agents.
