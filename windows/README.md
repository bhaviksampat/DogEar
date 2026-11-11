# 📖 Dog-Ear for Windows

A desktop app that runs the same Dog-Ear code as the website, inside **WebView2** (the Edge engine built into Windows 10/11).
There's one codebase: a fix to `index.html`, `app.js` or `style.css` at the repo root goes into both the website and the app.

## Where books & notes are stored
`%LOCALAPPDATA%\DogEar` on each PC, for each Windows user. It covers uploaded PDFs, ink, sticky notes, bookmarks, last page and settings.
It survives restarts and app updates. It's removed only if that folder is deleted.
Export/Import notes works the same as on the web, to back up or move to another PC.

## Build & run (needs the .NET 10 SDK)
```bash
dotnet run --project DogEar.Desktop
```
Or open `DogEar.Desktop.sln` in Visual Studio and press F5.

## Make a version to share
```bash
dotnet publish DogEar.Desktop -c Release -o publish
```
`publish\` then holds `DogEar.exe` and a `web\` folder. Zip that folder and send it, and users unzip it and run `DogEar.exe`.
No .NET install is needed. The only requirement is the WebView2 Runtime, which comes with Windows 11 and up-to-date Windows 10.
If it's missing, the app says so and links to the installer.

## Notes
- **Works offline.** PDF.js is bundled in `vendor/pdfjs/`. Only the sticky-note handwriting font comes from Google Fonts. Without internet, sticky notes fall back to the system's cursive font.
- The app serves its files from `https://dogear.example`. Don't change that name in `Program.cs`, or existing users will lose sight of their saved books and notes.
- Windows SmartScreen may warn about an unsigned exe. Signing it, or packaging it as MSIX for the Microsoft Store, removes the warning.
