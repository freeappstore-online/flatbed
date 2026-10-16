// Browser APIs jsdom lacks but the SDK and capture touch. No-op in Node-environment tests.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// Node's own createObjectURL only takes Node Blobs, not jsdom's; components only need a string.
if (typeof window !== 'undefined' || typeof URL.createObjectURL !== 'function') {
  let n = 0
  URL.createObjectURL = () => `blob:test/${++n}`
  URL.revokeObjectURL = () => {}
}

if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = () => Promise.resolve()
}

// jsdom has no canvas; previews skip drawing when there's no context.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}
