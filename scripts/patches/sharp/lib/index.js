// ============================================================================
// SHARP STUB — minimal no-op implementation
// Why: real sharp needs a native prebuilt binary that npm couldn't fetch
// (network glitch). Plasmo imports sharp at build time but we already have
// all icon sizes pre-built, so sharp is only required to *load*, never called.
// 
// To replace with real sharp when network is available:
//   rm -rf extension/node_modules/sharp
//   cd extension && npm install sharp --include=optional --foreground-scripts
// ============================================================================

function makeStubPipeline(input) {
  const self = {
    _input: input,
    resize: () => self,
    png: () => self,
    jpeg: () => self,
    webp: () => self,
    avif: () => self,
    tiff: () => self,
    gif: () => self,
    raw: () => self,
    extract: () => self,
    extend: () => self,
    trim: () => self,
    rotate: () => self,
    flip: () => self,
    flop: () => self,
    sharpen: () => self,
    median: () => self,
    gaussian: () => self,
    flatten: () => self,
    negate: () => self,
    normalize: () => self,
    normalizeOrConvert: () => self,
    convolve: () => self,
    threshold: () => self,
    linear: () => self,
    recomb: () => self,
    modulate: () => self,
    tint: () => self,
    greyscale: () => self,
    grayscale: () => self,
    toColourspace: () => self,
    toColorspace: () => self,
    removeAlpha: () => self,
    ensureAlpha: () => self,
    extractChannel: () => self,
    joinChannel: () => self,
    bandbool: () => self,
    composite: () => self,
    metadata: async () => ({
      format: "png", width: 0, height: 0, space: "srgb",
      channels: 3, depth: "uchar", isOpaque: true, hasAlpha: false,
      hasProfile: false, orientation: 1, size: 0
    }),
    stats: async () => ({ channels: [] }),
    toBuffer: async () => Buffer.isBuffer(input) ? input : Buffer.from(""),
    toFile: async (path) => ({ path, size: 0, format: "png" }),
  };
  return self;
}

function sharp(input, options) {
  return makeStubPipeline(input);
}

// Mimic sharp's static API
sharp.versions = { vips: "8.15.0-stub", sharp: "0.33.5", libvips: "8.15.0", zlib: "stub" };
sharp.format = new Proxy({}, { get: () => ({ input: { file: true, buffer: true, stream: true } }) });
sharp.cache = () => {};
sharp.simd = () => true;
sharp.concurrency = () => 1;
sharp.counters = () => ({});
sharp.queue = { on: () => {}, pause: () => {}, resume: () => {} };
sharp.create = () => makeStubPipeline(null);
sharp.createFromDivisor = () => makeStubPipeline(null);
sharp.bool = { and: "and", or: "or", eor: "eor" };
sharp.kernel = { near: "nearest", cubic: "cubic", mitchell: "mitchell", lanczos2: "lanczos2", lanczos3: "lanczos3" };
sharp.interpolator = { near: "nearest", bilinear: "bilinear", bicubic: "bicubic", locallyBoundedBicubic: "lbb", nearest: "nearest", tetrahedral: "tetrahedral" };
sharp.strategy = { attention: 0, entropy: 1, trim: 2 };
sharp.fit = { cover: "cover", contain: "contain", fill: "fill", inside: "inside", outside: "outside" };
sharp.position = { center: "center", top: "top", right: "right", bottom: "bottom", left: "left", entropy: "entropy", attention: "attention" };
sharp.gravity = { center: 0, north: 1, east: 2, south: 3, west: 4, northeast: 5, southeast: 6, southwest: 7, northwest: 8 };

export default sharp;

// === PATCHED-BY-scripts-patch-node-modules.sh ===
