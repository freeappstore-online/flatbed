type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean }
type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean }

/** Torch support belongs to the active camera track, not the browser as a whole. */
export function supportsTorch(track: MediaStreamTrack | undefined): track is MediaStreamTrack {
  if (!track?.applyConstraints || !track.getCapabilities) return false
  try {
    return (track.getCapabilities() as TorchCapabilities).torch === true
  } catch {
    return false
  }
}

/** Preserve camera constraints while changing only the LED torch setting. */
export function applyTorch(track: MediaStreamTrack, enabled: boolean): Promise<void> {
  const current = track.getConstraints?.() ?? {}
  const advanced = (current.advanced ?? []).filter((set) => !('torch' in set)) as TorchConstraint[]
  return track.applyConstraints({
    ...current,
    advanced: [...advanced, { torch: enabled }],
  } as MediaTrackConstraints)
}
