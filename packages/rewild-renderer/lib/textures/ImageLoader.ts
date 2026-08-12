const BITMAP_OPTIONS: ImageBitmapOptions = { colorSpaceConversion: 'none' };

// Images fetched at once, across every loader instance.
//
// HTTP/2 does not apply the six-request-per-host cap HTTP/1.1 did, so the
// texture library's `Promise.all` opens a stream per image — ~90 of them, ~95MB
// — on a single connection. They then split the pipe: none finishes early, all
// of them stay in flight for the whole transfer, and the unlucky ones exceed the
// browser's stall timeout and fail with ERR_TIMED_OUT. The same URL loads
// instantly on its own, which is what makes it look like a server fault.
//
// Six keeps each request short enough to complete while still saturating a
// normal connection.
const MAX_CONCURRENT_LOADS = 6;

// Gating narrows the window for a timeout without closing it — the library is
// large enough that a slow connection can still stall a request. A timed-out
// fetch is transient by nature, so retry rather than failing the whole scene
// over one texture.
const MAX_ATTEMPTS = 3;

// Doubles per attempt. Only a floor: a retry re-enters the queue behind
// everything already waiting, so under contention the real wait is longer, which
// is the desired shape — retries land as the queue drains and bandwidth frees up.
const RETRY_BASE_DELAY_MS = 500;

let inFlight = 0;
const waiting: (() => void)[] = [];

function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT_LOADS) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiting.push(resolve));
}

// Hands the slot straight to the next waiter rather than freeing it, so a burst
// of queued loads cannot momentarily exceed the cap.
function release(): void {
  const next = waiting.shift();
  if (next) next();
  else inFlight--;
}

function decode(src: string): Promise<ImageBitmap> {
  return new Promise<ImageBitmap>((resolve, reject) => {
    const img = document.createElement('img');
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      createImageBitmap(img, BITMAP_OPTIONS).then(resolve, reject);
    };
    // The error event carries nothing useful, so name the source: a failed
    // texture is otherwise untraceable back to its URL.
    img.onerror = () => reject(new Error(`Failed to load image '${src}'`));
    img.src = src;
  });
}

// Jittered so a stalled pipe — which tends to fail several requests at once —
// does not retry them all in the same instant and stall again.
function backoff(attempt: number): Promise<void> {
  const base = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  const delay = base + Math.random() * base;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function loadOne(src: string): Promise<ImageBitmap> {
  for (let attempt = 1; ; attempt++) {
    await acquire();
    try {
      return await decode(src);
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      console.warn(
        `Image load failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying: ${src}`
      );
    } finally {
      // Released before the backoff, so a waiting image gets the slot instead of
      // the queue idling through the delay.
      release();
    }
    await backoff(attempt);
  }
}

/**
 * Decodes already-fetched image bytes — a GLB-embedded texture, or a data URI.
 *
 * No concurrency gate: that exists for network requests, and these bytes have
 * already arrived inside the model. The decode itself still goes through
 * `BITMAP_OPTIONS`, so an embedded texture and a file-backed one are decoded
 * identically.
 */
export function decodeImageBytes(
  bytes: Uint8Array,
  mimeType?: string
): Promise<ImageBitmap> {
  const blob = new Blob(
    [bytes as BlobPart],
    mimeType ? { type: mimeType } : {}
  );
  return createImageBitmap(blob, BITMAP_OPTIONS);
}

/**
 * Decodes image files to `ImageBitmap`s for upload as GPU textures.
 *
 * Fetches are gated at `MAX_CONCURRENT_LOADS` process-wide and retried up to
 * `MAX_ATTEMPTS` — see the notes there for why both matter more than they look.
 *
 * Decoding is deliberately *not* colour-managed — see `BITMAP_OPTIONS`.
 */
export class ImageLoader {
  images: ImageBitmap[];
  maxWidth: number;
  maxHeight: number;

  constructor() {}

  async loadImages(paths: string[]) {
    const images = await Promise.all(paths.map(loadOne));

    const { maxHeight, maxWidth } = images.reduce(
      (prev, cur) => {
        prev.maxHeight = Math.max(cur.height, prev.maxHeight);
        prev.maxWidth = Math.max(cur.width, prev.maxWidth);
        return prev;
      },
      { maxHeight: 0, maxWidth: 0 }
    );

    this.maxHeight = maxHeight;
    this.maxWidth = maxWidth;
    this.images = images;
    return this;
  }
}
