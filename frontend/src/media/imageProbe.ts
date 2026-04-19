// Raven Scout — Cheap image dimension/size probes (PURE).
//
// Reads JPEG/PNG dimensions from the binary header without decoding
// the full image. Used by `compressImage` to skip work when the input
// is already within the target profile.
//
// Returns null if the input isn't a recognized format (callers fall
// back to a normal compression pass).

export interface ProbeResult {
  width: number;
  height: number;
  format: 'jpeg' | 'png';
  bytes: number;
}

/** Strip data: prefix and decode base64 to a Uint8Array. */
function decodeBase64ToBytes(input: string): Uint8Array | null {
  if (!input) return null;
  const comma = input.indexOf(',');
  const b64 = input.startsWith('data:') && comma >= 0 ? input.slice(comma + 1) : input;
  try {
    if (typeof atob === 'function') {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    // Node fallback (used by tests)
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
  } catch {}
  return null;
}

function readUint16BE(b: Uint8Array, i: number): number {
  return (b[i] << 8) | b[i + 1];
}

function readUint32BE(b: Uint8Array, i: number): number {
  return (b[i] << 24 >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
}

/** Parse JPEG SOF marker for width/height. */
function probeJpeg(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1];
    // skip padding 0xff bytes
    while (marker === 0xff && i + 1 < b.length) {
      i++;
      marker = b[i + 1];
    }
    i += 2;
    // SOF0..SOF15 except DHT(0xc4), JPG(0xc8), DAC(0xcc)
    if (
      (marker >= 0xc0 && marker <= 0xcf) &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    ) {
      if (i + 7 >= b.length) return null;
      // 2 length, 1 precision, 2 height, 2 width
      const height = readUint16BE(b, i + 3);
      const width = readUint16BE(b, i + 5);
      return { width, height };
    }
    if (i + 1 >= b.length) return null;
    const segLen = readUint16BE(b, i);
    if (segLen < 2) return null;
    i += segLen;
  }
  return null;
}

/** Parse PNG IHDR for width/height (bytes 16..23). */
function probePng(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24) return null;
  // PNG signature
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  return { width: readUint32BE(b, 16), height: readUint32BE(b, 20) };
}

export function probeImage(input: string): ProbeResult | null {
  const bytes = decodeBase64ToBytes(input);
  if (!bytes || bytes.length < 4) return null;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
  if (isJpeg) {
    const dim = probeJpeg(bytes);
    return dim ? { ...dim, format: 'jpeg', bytes: bytes.length } : null;
  }
  if (isPng) {
    const dim = probePng(bytes);
    return dim ? { ...dim, format: 'png', bytes: bytes.length } : null;
  }
  return null;
}

/**
 * Decide whether to skip recompression.
 *  - Input must be JPEG (re-encoding a JPEG always loses quality)
 *  - Width must already be ≤ target maxDim
 *  - Byte size must be reasonable (≤ targetMaxBytes — heuristic for
 *    "already at acceptable quality")
 */
export function shouldSkipCompression(
  input: string,
  opts: { maxDim: number; targetMaxBytes?: number },
): { skip: boolean; probe: ProbeResult | null; reason: string } {
  const probe = probeImage(input);
  if (!probe) return { skip: false, probe: null, reason: 'unprobeable' };
  if (probe.format !== 'jpeg') return { skip: false, probe, reason: 'not-jpeg' };
  if (probe.width > opts.maxDim) {
    return { skip: false, probe, reason: 'oversized' };
  }
  // 200 KB per megapixel of target as a generous upper bound for
  // "already at acceptable quality"
  const mp = (opts.maxDim * opts.maxDim) / 1_000_000;
  const target = opts.targetMaxBytes ?? Math.max(80_000, Math.round(mp * 200_000));
  if (probe.bytes > target * 1.5) {
    return { skip: false, probe, reason: 'oversized-bytes' };
  }
  return { skip: true, probe, reason: 'within-budget' };
}
