# flatbed

Flatbed: a private document scanner on FreeAppStore — camera capture (multi-page, photo/file
import), automatic edge detection with adjustable corners and perspective correction, filters
(original, greyscale, B&W, magic colour) and multi-page PDF export (pdf-lib), with saved scans in
IndexedDB. Nothing leaves the device. In progress: capture (`web/src/capture`) and crop (`web/src/crop`) work, the rest is still to come; see
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
- Edge detection, perspective correction and rotation are our own code (`web/src/crop`), no
  third-party library. Record the name, version and licence of any library added here.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
