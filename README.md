# Waxstack

Photograph your record shelves, then type any record and watch its spine light up in the photo.

## How it works

1. **Collection.** Import from Discogs (public collection, by username), a Discogs CSV export, or add records by hand. You can also skip this and build the list from what the spines say.
2. **Shelves.** Add one photo per cube, shelf or crate, in the order you'd walk along them, and say how each is sorted.
3. **Spine reading.** Each photo is cut into overlapping vertical strips, and Claude (`claude-opus-5-5`) reads every spine in each strip, returning its position and text. Claude is also given your collection list, so it picks the matching record instead of guessing from scratch. Spines Claude doesn't match get a fuzzy text match on the device.
4. **Search.** Type an artist, title, label or catalogue number. A located record glows in its photo. If its spine couldn't be read but the section is sorted A–Z, Waxstack estimates its position from the nearest located neighbours, and works out whether you file solo artists by surname.
5. **Fixing.** Tap any spine to confirm it, choose a different record, add it as a new record, or remove it. Confirmed spines survive a re-scan.

Everything (records, photos, positions) is stored in the browser's IndexedDB on the device. The server only holds the API keys and forwards requests to Claude and Discogs. Collection → Backup downloads and restores everything as one file.

## Run it locally

```bash
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm install
npm run dev
```

Open http://localhost:3000. To try it on your phone on the same Wi‑Fi, use your Mac's local IP address (camera capture needs HTTPS on most phones, so deploying is easier; see below).

## Deploy (Vercel)

1. Push this folder to a GitHub repo.
2. Import it at vercel.com/new (framework: Next.js, no settings to change).
3. Add the environment variable `ANTHROPIC_API_KEY` (and optionally `DISCOGS_TOKEN`).
4. Deploy. Open the URL on your phone and use "Add to Home Screen" to get it as an app.

## Code map

- `src/app/page.tsx`: Find (search + heat map)
- `src/app/shelves/`: section list, add-a-photo flow, section detail with spine fixing
- `src/app/collection/page.tsx`: imports, manual add, backup
- `src/app/api/read-spines/route.ts`: Claude vision call (structured output)
- `src/app/api/discogs/route.ts`: Discogs collection proxy
- `src/lib/scan.ts`: strips → Claude → merge duplicates → match → save
- `src/lib/match.ts`: fuzzy matching, search scoring, A–Z position estimates
- `src/components/ShelfView.tsx`: photo with heat-map overlay

## Not built yet (ideas for next)

- Accounts and cloud sync (Supabase) so a collection works across devices
- Re-scan diff: photograph a section again and see what moved
- Wrapping as a native iOS/Android app
- DJ mode (BPM/key) from the Manus version
