# Photo upload — production setup

The wedding site is on **GitHub Pages** (`https://eeesc.github.io/svatba/`).  
GitHub Pages is static only — uploads go through **Google Apps Script** (same pattern as RSVP).

The Vercel `/api/upload-photo` route is kept for a future full Vercel deploy, but the service account **cannot** upload into a normal My Drive folder (Google returns `storageQuotaExceeded`). Apps Script runs as you and works with your existing folder.

---

## Step 1 — Deploy Apps Script (≈5 min)

1. Open [script.google.com](https://script.google.com) → **New project**
2. Paste contents of `apps-script-upload.gs`
3. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the **`/exec`** URL (looks like `https://script.google.com/macros/s/…/exec`)

## Step 2 — Paste URL into the site

In both `nahrati-fotky.html` and `upload-photos-en.html`, replace:

```javascript
const APPS_SCRIPT_UPLOAD_URL = 'PASTE_EXEC_URL_AFTER_DEPLOY';
```

with your `/exec` URL, then commit and push to `main`. GitHub Pages updates in ~1 minute.

## Step 3 — Test

1. Open `https://eeesc.github.io/svatba/nahrati-fotky.html`
2. Pick a small JPEG, optionally fill in “Od koho…”
3. Click **Nahrát fotky**
4. Check [your Drive folder](https://drive.google.com/drive/folders/1n7GYR_Vjrfv2T2DYal5X1GUFh5c5uFSb) for the file

### Local smoke test (Drive credentials)

```bash
python3 scripts/test-drive-upload.py
```

Expect a **403** until the folder lives in a **Shared Drive** — that’s normal for the service-account path. Apps Script bypasses this.

---

## Optional — Vercel (service account / Shared Drive)

Only needed if you move the folder into a **Google Shared Drive** and add `jonas-216@svatebni-fotky.iam.gserviceaccount.com` as a member.

```bash
npm install
npx vercel login
npx vercel env add GOOGLE_DRIVE_FOLDER_ID
npx vercel env add GOOGLE_SERVICE_ACCOUNT_JSON
npx vercel --prod
```

Set `uploadMode: 'multipart'` and `uploadUrl: '/api/upload-photo'` in the HTML config when the whole site runs on Vercel.

---

## Pages

| Language | URL |
|----------|-----|
| Czech | `/nahrati-fotky.html` |
| English | `/upload-photos-en.html` |

The old gallery (`fotky.html`) is unchanged.
