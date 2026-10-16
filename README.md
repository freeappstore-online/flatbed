# Flatbed

**Scan documents to PDF on your device: auto-crop, filters and multi-page export.
Nothing leaves your phone.** A free app on [FreeAppStore](https://freeappstore.online), live at
https://flatbed.freeappstore.online.

Shoot pages with the camera or import photos; Flatbed finds the page edges, straightens them,
cleans them up (greyscale, black & white or magic colour) and makes a multi-page PDF in A4, Letter
or fit, to share or download. Scans are saved in this browser, to rename, reorder, delete and
export again. Images and PDFs never leave the device. Built under
[freeappstore-online/platform#238](https://github.com/freeappstore-online/platform/issues/238).

## Develop

```bash
pnpm install
pnpm dev      # local dev server
pnpm build    # production build in web/dist
fas check     # FreeAppStore compliance checks
```

Pushes to `main` auto-deploy via GitHub Actions.

## License

MIT.
