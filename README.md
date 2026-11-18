# Apex Search

The SearXNG client for ApexOS: a private, offline-first shell around your own
instance (default `https://searxng-6mmb.onrender.com/search?q=%s`). Vanilla
HTML, CSS and JS with relative `./` paths, so it runs from a folder, from
`/apps/search/` in the ApexOS bundle, or from the GitHub Pages copy.

```
index.html      search bar, categories, results frame, history + settings sheets
styles.css      mobile-first dark UI, sized for an ApexOS app window
app.js          URL building, history, suggestions, panels, offline state
manifest.json   PWA manifest, scope ./
sw.js           precaches the shell; never caches SearXNG traffic
offline.html    served by the service worker when a navigation fails
icons/          192, 512 and maskable 512 app icons
```

## Run

Any static server from this folder:

```
python3 -m http.server 8080
```

Open `http://localhost:8080/`. There is no build step and no dependency.

## How searching works

1. A query becomes `<instance>/search?q=<query>`, with `&categories=images`,
   `it` or `news` appended for the category tabs (All sends no category).
2. Results render in an iframe below the bar, because the shell has no backend
   to proxy SearXNG and the instance owns its own result markup.
3. Every search also gets a copy link: the URL is mirrored into the page hash
   (`#q=...&c=it`), so a reload or a shared link reopens the same results.

If your instance sends `X-Frame-Options: SAMEORIGIN` or a restrictive
`frame-ancestors`, the frame stays empty and Apex Search offers **Open results
in a new tab** plus a shortcut to change instance. Allow embedding on the
SearXNG side (`server.http.headers` / reverse-proxy config) to keep results
inline.

## The instance setting

Settings (gear) stores a replacement URL in `localStorage`. Include `%s` where
the query belongs:

```
https://searx.example.org/search?q=%s
```

Without `%s`, Apex Search appends `?q=` (or `&q=`) itself. `Use the default`
restores the built-in instance.

## History and privacy

- Search history lives in `localStorage` under `apex-search:history`, capped at
  40 entries, and can be cleared from the history sheet.
- Suggestions are generated locally from history plus a fixed list of example
  queries. Nothing is sent to a suggestion service.
- No cookies, no analytics, no fonts or scripts from third parties. The only
  network traffic is the results iframe to the instance you configured, so the
  instance sees your queries (that is what a search engine does) and nothing
  else on the device does.

## Offline behaviour

The service worker precaches `index.html`, `styles.css`, `app.js`, the manifest,
the offline page and the icons on first load. Later visits open from cache
instantly and work with no connection; searches then say so instead of failing
silently. SearXNG responses are deliberately not cached.

After changing shell files, bump `CACHE` in `sw.js` (`apex-search-v1` →
`apex-search-v2`) so installed copies pick the new files up.

## In ApexOS

The bundle workflow clones this repo to `dist/apps/search/`, so the app opens at
`/apps/search/`. `manifest.json` keeps `start_url`, `scope` and the icon paths
relative, and `sw.js` registers with `./sw.js`, so the same files work at that
path, at the repository root, or under a preview URL.
