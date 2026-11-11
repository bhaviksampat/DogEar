# 📖 Dog-Ear

*Read, scribble, fold the corner.* A paper-like PDF reader.

Static site with no build step and no server code. PDF.js 3.11.174 is bundled in `vendor/pdfjs/`, so it works offline.

- **Shelf**: books you ship in `books/`, plus PDFs you upload in the browser
- **Reading**: two-page spread with a spine shadow on wide screens, one page on phones. Turn pages by tapping an edge, swiping, or with the arrow keys. It remembers your page.
- **Marking up**: pen, highlighter, eraser, undo (Ctrl+Z), sticky notes you can drag and fold, and folded-corner bookmarks
- **Notes panel**: every bookmark, note and mark in a book, by page
- **Read aloud**: 🗣️ reads from the current page and turns pages as it goes. Pick 👂 and click any sentence to start there. The sentence being read is highlighted, and you can set the speed. It uses your device's built-in voices, so scanned (image-only) PDFs can't be read.

Shortcuts: `R` read · `P` pen · `H` highlighter · `E` eraser · `S` sticky · `B` bookmark · `N` notes · `L` read aloud · `M` page sound on/off · `Esc`

Page turns make a paper sound. It's generated in code, so it's slightly different every time. To tune it, change `SOUND` in `app.js`.

## Add books to the shelf
Put PDFs in `books/` and list them in `books/index.json`:
```json
[{ "title": "Welcome to Dog-Ear", "file": "welcome.pdf" }]
```
Anything in `books/` can be downloaded by anyone who has the URL, so only add books you're allowed to share.

## Where data lives
Uploaded PDFs and all notes stay in **this browser** (IndexedDB). Nothing is uploaded anywhere.
To move notes to another device, use **Export notes**, then **Import notes** on the other device. Uploaded books are matched by file content, so re-upload the same PDF there.

## Run locally
```bash
npx http-server -p 8080
```

## Logo
`icons/logo.svg` is the master file: a page whose folded corner is a floppy golden dog's ear. After editing it, run `node icons/make-icons.mjs` (Windows, uses Edge) to regenerate `apple-touch-icon.png`, `logo-512.png` and `DogEar.ico`.

## Windows app
`windows/DogEar.Desktop.sln` wraps this same code as a desktop app. Books and notes stay on each PC. See [windows/README.md](windows/README.md).

## Deploy free (pick one)
- **Netlify Drop**: drag this folder onto https://app.netlify.com/drop
- **GitHub Pages**: push to a repo, then Settings → Pages → deploy from branch `main`, folder `/`
- **Cloudflare Pages / Vercel**: import the repo. Leave the build command empty and set the output directory to `/`
