/**
 * The header of a w×h colour JPEG: start-of-image, a baseline frame header
 * and end-of-image. Enough for pdf-lib, which reads the size and embeds the
 * bytes without decoding them.
 */
export function fakeJpeg(w: number, h: number): Uint8Array {
  return new Uint8Array([
    ...[0xff, 0xd8],
    ...[0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03],
    ...[0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01],
    ...[0xff, 0xd9],
  ])
}
