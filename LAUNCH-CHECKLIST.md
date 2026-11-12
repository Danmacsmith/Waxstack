# Waxstack launch checklist

## Done
- [x] App built: collection import (Discogs, CSV, manual), shelf photos, Claude spine reading, search with heat map, A–Z estimates, spine fixing, backup/restore
- [x] Spine reading sends high-resolution strips (up to 2576px, the most Claude Opus 5.5 reads) and asks for pixel positions
- [x] "Add a spine it missed": tap the photo where a record is and link it
- [x] Sample shelves demo, so anyone can try search before taking photos
- [x] Photo tips on the Shelves screen, plus a warning for small or very wide photos
- [x] 23 unit tests for matching, A–Z estimates and CSV import (`npm test`)

## Can be done from your phone, while away
- [ ] Get a Claude API key: console.anthropic.com → API keys. Add some credit (a few pounds is plenty for testing).
- [ ] Create an empty **private** GitHub repo called `waxstack` (no README), so the code can be pushed.
- [ ] Sign up at vercel.com with your GitHub account.

## When you're back (about 30 minutes)
1. **Key:** copy `.env.example` to `.env.local` and paste the key in.
2. **First real test:** run the app, then photograph **one** cube or shelf.
   - Open the section and count how many spines it found and matched against what's really there.
   - Tap any wrong ones and fix them. Note roughly how many needed fixing.
   - Good result: about 80%+ of spines found, and most readable ones matched.
3. **Tune if needed.** If it's weak, the levers are: more, narrower strips (`cutStrips` in `src/lib/image.ts`); higher effort in `src/app/api/read-spines/route.ts`; or advice to take closer photos.
4. **Import your collection** (Discogs or CSV) and photograph the rest of the shelves in walking order.
5. **Deploy:** import the GitHub repo in Vercel, add `ANTHROPIC_API_KEY` and an `ACCESS_CODE` (any word you give testers) as environment variables, deploy.
6. **Phone:** open the Vercel URL in Safari → Share → Add to Home Screen.
7. **Testers:** send the link to 3–5 collectors. Ask them to use "Try it first with sample shelves" first, then one real shelf.

## Before a wider launch
- [ ] Accounts and cloud sync (right now data lives on one phone; Backup moves it)
- [ ] Spending limit on the Anthropic key (console.anthropic.com → Limits). Set `ACCESS_CODE` in Vercel so only testers with the code can scan.
- [ ] Privacy note (photos go to Claude for reading; nothing is stored on the server)
- [ ] A name/domain check for "Waxstack"
