# flatbed

Flatbed: a private document scanner on FreeAppStore — camera capture (multi-page, photo/file
import), automatic edge detection with adjustable corners and perspective correction, filters
(original, greyscale, B&W, magic colour) and multi-page PDF export (pdf-lib), with saved scans in
IndexedDB. Nothing leaves the device. Code by feature in `web/src/{capture,crop,filters,export,library}`;
see freeappstore-online/platform#238.

- Live: https://flatbed.freeappstore.online
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test` (vitest; component tests use jsdom)
- E2E: `pnpm test:e2e` (Playwright on the production build; `web/e2e/fake-camera.ts` feeds a drawn
  page into getUserMedia; axe checks every screen in light and dark)
- Check: `fas check` and `fas screencheck` (on Windows run `pnpm build && fas screencheck
  --skip-build`: its own build step can't spawn pnpm there)
- Deploy: `git push origin main` (auto-deploys to R2 via GitHub Actions)

## Notes

- Fonts are self-hosted (`@fontsource-variable/*`); the app makes no third-party requests
  beyond the platform API and analytics loader. Keep it that way.
- Images and PDFs never leave the device: no uploads, no server-side processing. The privacy
  note (`web/src/Privacy.tsx`, on About) says so and discloses the platform analytics; keep it true.
- Camera, crop and filter screens are always dark (`web/src/ui/FullScreen.tsx`: a portal that makes
  the rest of the page inert and returns focus on close); the rest follows the Shell's theme toggle.
- Analytics record the screen path, so scan ids and names stay out of URLs and titles (`/scan`,
  with the id in history state).
- Edge detection, perspective correction, rotation and filters are our own code.
- Shipped third-party libraries (record name, version and licence of any added, add it to
  `web/scripts/third-party-licenses.mjs` and run `pnpm run third-party-licenses` in `web/` to
  regenerate `web/public/third-party-licenses.txt`, linked from About):
  - pdf-lib 1.17.1, MIT (PDF export, loaded on demand), with its dependencies
    @pdf-lib/standard-fonts 1.0.0 MIT, @pdf-lib/upng 1.0.1 MIT, pako 1.0.11 MIT AND Zlib,
    tslib 1.14.1 0BSD.
  - idb 8.0.4, ISC (saved scans in IndexedDB).
  - Test-only, not shipped: fake-indexeddb 6.2.5 Apache-2.0, @playwright/test and playwright
    1.64.1 Apache-2.0, @axe-core/playwright 4.14.0 MPL-2.0.

Platform conventions: https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md
