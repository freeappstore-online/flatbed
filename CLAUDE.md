# flatbed

Flatbed: a private document scanner on FreeAppStore — camera capture (multi-page, photo/file
import), automatic edge detection with adjustable corners and perspective correction, filters
(original, greyscale, B&W, magic colour) and multi-page PDF export (pdf-lib), with saved scans in
IndexedDB. Nothing leaves the device. In progress: capture, crop, filters and PDF export work (`web/src/{capture,crop,filters,export}`); saved scans are still to come; see
freeappstore-online/platform#238.

- Live: https://flatbed.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test` (vitest; component tests use jsdom)
- Check: `fas check`
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.
- Images and PDFs never leave the device: no uploads, no server-side processing.
- Edge detection, perspective correction, rotation and filters are our own code.
- Third-party libraries (record name, version and licence of any added, and regenerate
  `web/public/third-party-licenses.txt`, linked from About):
  - pdf-lib 1.17.1, MIT (PDF export, loaded on demand), with its dependencies
    @pdf-lib/standard-fonts 1.0.0 MIT, @pdf-lib/upng 1.0.1 MIT, pako 1.0.11 MIT AND Zlib,
    tslib 1.14.1 0BSD.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
