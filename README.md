# Aushadhi Team Roster — Cloud Sync Setup Guide
# Uses GitHub as the shared database (free, no expiry)

## What you need
- A free GitHub account (github.com)
- 15 minutes

---

## Step 1: Create the GitHub repository

1. Go to https://github.com → New repository
2. Name: `aushadhi-roster` → Public → Add README → Create
3. Upload these files to the repo:
   - `index.html`
   - `aushadhi.js`
   - `aushadhi.css`
   - `icon.svg`
   - `aushadhi-data.json`  ← this is the shared database

---

## Step 2: Enable GitHub Pages (app hosting)

1. Go to your repo → Settings → Pages
2. Source: Deploy from branch → Branch: `main` → `/root` → Save
3. Your app URL: `https://YOUR_USERNAME.github.io/aushadhi-roster/`

Share this URL with your team. Works on any mobile browser.

---

## Step 3: Get your data file URLs

After uploading, get two URLs from your repo:

**Raw URL** (for viewers to pull data):
- Go to `aushadhi-data.json` in your repo → click `Raw`
- Copy the URL, e.g.:
  `https://raw.githubusercontent.com/YOUR_USER/aushadhi-roster/main/aushadhi-data.json`

**API URL** (for admin to push data):
- `https://api.github.com/repos/YOUR_USER/aushadhi-roster/contents/aushadhi-data.json`

---

## Step 4: Create a GitHub Personal Access Token (admin only)

1. GitHub → Settings (top right) → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token → Name: `aushadhi-admin` → Expiration: 1 year
3. Scope: tick only `repo` (or just `public_repo` if your repo is public)
4. Generate → copy the token (starts with `ghp_...`) — you won't see it again

---

## Step 5: Configure the app

Open the app URL → tap ⚙ in the sync bar → fill in:

**For viewers (read-only):**
- Raw URL: (paste from Step 3)
- Leave API URL, token, and PIN blank
- Tap "Save & connect" → app pulls latest data

**For admins:**
- Raw URL: (paste from Step 3)
- API URL: (paste from Step 3)
- GitHub Token: `ghp_...`
- Your name: e.g. "Coordinator"
- Admin PIN: `aushadhi2025` (default — change it below)
- Tap "Save & connect" → 🔑 Admin badge appears

---

## Step 6: Change the admin PIN (recommended)

1. Open your browser's developer console (F12)
2. Run this (replace YOUR_PIN with your chosen PIN):
   ```js
   crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOUR_PIN'))
     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
   ```
3. Copy the hash
4. Open `index.html` → find `window._adminPinHash = '...'` → replace the value
5. Re-upload `index.html` to GitHub

---

## How sync works

| Action | Who | What happens |
|--------|-----|--------------|
| ⬇ Pull | Anyone | Fetches latest `aushadhi-data.json` from GitHub, updates the app |
| ⬆ Push | Admin only | Saves current app data to `aushadhi-data.json` on GitHub |
| Auto-pull | Anyone | Happens automatically when app opens (if Raw URL is configured) |
| Export Excel | Anyone | Downloads `.xlsx` from current in-app data |
| Import Excel | Admin only | Loads `.xlsx` into app; tap ⬆ Push to sync to all |

**Typical admin workflow:**
1. Open app → already auto-pulled → see latest data
2. Make changes (add volunteer, run assignment, etc.)
3. Tap ⬆ Push → all viewers see it within seconds on next pull

**Typical viewer workflow:**
1. Open app → auto-pulls latest data → view roster/summary
2. Tap ⬇ Pull any time to refresh

---

## Files in this package

| File | Purpose |
|------|---------|
| `index.html` | Main app + admin PIN hash |
| `aushadhi.js` | All app logic + cloud sync |
| `aushadhi.css` | All styles |
| `icon.svg` | App icon |
| `aushadhi-data.json` | Shared database (upload to GitHub, never edit manually) |
| `README.md` | This guide |

---

## FAQ

**Do viewers need a GitHub account?**
No. They just open the app URL and tap ⬇ Pull. No login needed.

**What if two admins push at the same time?**
The second push overwrites the first. For a small team (1-2 admins) this is fine.

**Does it work offline?**
Yes. The app caches the last pulled data locally, so it works without internet.

**How much data does it use?**
Tiny — the JSON file is under 50KB for a full 6-month roster with 20 volunteers.

**Does the free GitHub tier expire?**
No. GitHub free accounts are permanent. Public repos have unlimited storage.
