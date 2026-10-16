# Flatbed

**Coming soon — scan documents to PDF on your device: auto-crop, filters and multi-page export.
Nothing leaves your phone.** A free app on [FreeAppStore](https://freeappstore.online), live at
https://flatbed.freeappstore.online.

Right now this is a shell: it lists the planned features, but none of them work yet. Progress is
tracked in
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
