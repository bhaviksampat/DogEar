# Shelf: a paper-like PDF reader

Static site with no build step and no server code. It uses PDF.js from a CDN.

- **Shelf**: books you ship in `books/`, plus PDFs you upload in the browser
- **Reading**: two-page spread with a spine shadow on wide screens, one page on phones. Turn pages by tapping an edge, swiping, or with the arrow keys. It remembers your page.
- **Marking up**: pen, highlighter, eraser, undo (Ctrl+Z), sticky notes you can drag and fold, and folded-corner bookmarks
- **Notes panel**: every bookmark, note and mark in a book, by page

Shortcuts: `R` read · `P` pen · `H` highlighter · `E` eraser · `S` sticky · `B` bookmark · `N` notes · `Esc`

## Add books to the shelf
Put PDFs in `books/` and list them in `books/index.json`:
```json
[{ "title": "Welcome to Shelf", "file": "welcome.pdf" }]
```
Anything in `books/` can be downloaded by anyone who has the URL, so only add books you're allowed to share.

## Where data lives
Uploaded PDFs and all notes stay in **this browser** (IndexedDB). Nothing is uploaded anywhere.
To move notes to another device, use **Export notes**, then **Import notes** on the other device. Uploaded books are matched by file content, so re-upload the same PDF there.

## Run locally
```bash
npx http-server -p 8080
```

## Deploy free (pick one)
- **Netlify Drop**: drag this folder onto https://app.netlify.com/drop
- **GitHub Pages**: push to a repo, then Settings → Pages → deploy from branch `main`, folder `/`
- **Cloudflare Pages / Vercel**: import the repo. Leave the build command empty and set the output directory to `/`
