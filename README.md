# IEEE CIS London Section Chapter — Website

Website of the **IEEE Computational Intelligence Society (CIS) Chapter of the IEEE London Section**
(London, Ontario, Canada — IEEE Canada, Region 7).

Live site: <https://ieee-cis-london.github.io/>

It is a plain static site (HTML/CSS/JS, no build step) served by GitHub Pages from the `main` branch.
All changeable content lives in [`data/site-data.json`](data/site-data.json).

## Updating content

### Option A — Admin page (events and stats)

1. Create a GitHub **fine-grained personal access token**
   ([GitHub → Settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)):
   - Resource owner: `IEEE-CIS-London`
   - Repository access: *Only select repositories* → `ieee-cis-london.github.io`
   - Permissions → Repository → **Contents: Read and write**
   - Give it a short expiration.
2. On the live site, click **Admin sign in** in the footer and paste the token.
3. Add/edit/delete events (with optional image upload) and edit the stats strip.
4. Click **Publish changes**. This commits `data/site-data.json` to `main`; the site updates in about a minute.

There is no password in the code: GitHub checks that the token can push to this repository.
Only people with write access to the repository can publish. The token is kept in the browser tab
(sessionStorage) and is forgotten when the tab is closed.

### Option B — Edit the JSON directly

Edit `data/site-data.json` on GitHub (or locally), then run `node test/validate.js` before committing.

```jsonc
{
  "siteMeta": {
    "announcement": "",          // optional banner under the header; empty = hidden
    "contactEmail": "…",         // used by all "Email the chapter" links
    "mailingListUrl": "",        // optional sign-up link
    "stats": [ { "value": "120+", "label": "Active CIS members" } ]  // empty values are hidden
  },
  "events": [
    {
      "id": "2026-11-18-dl-talk",          // unique, lowercase-with-dashes
      "title": "…",
      "date": "2026-11-18",                // YYYY-MM-DD; upcoming/past is worked out automatically
      "startTime": "14:00",                // optional, 24h, Eastern Time
      "endTime": "15:30",                  // optional
      "category": "Distinguished Lecture", // optional
      "location": "…",
      "speaker": "…",                      // optional
      "summary": "…",                      // shown on the card
      "description": "…",                  // shown in the details dialog
      "registrationUrl": "https://events.vtools.ieee.org/m/…",  // optional "Register" button
      "image": "assets/uploads/events/…jpg"                     // optional
    }
  ],
  "gallery": [
    { "url": "assets/uploads/gallery/…jpg", "title": "…", "caption": "…", "date": "2026-11-18" }
  ],                                       // the Gallery section only appears once it has photos
  "committee": [
    { "name": "…", "role": "Chair", "affiliation": "…", "profileUrl": "https://…",
      "email": "…", "photo": "assets/img/committee/….jpg" }
  ]
}
```

Committee photos should be square, about 320×320 px, with metadata (EXIF/GPS) stripped.

## Local preview

```bash
python3 -m http.server 8000   # then open http://localhost:8000
node test/validate.js         # validate data and check for secrets / broken anchors
```
