/**
 * The example riverbank photos, as one shared pool.
 *
 * Everywhere the app shows a picture it might not have -- a post with no photo,
 * a place with none on file, a tutorial slide -- it draws from here instead of
 * repeating a single placeholder. A board where every empty card is the same
 * image reads as a rendering bug; a board where they differ reads as a river.
 *
 * Collected by glob rather than listed, so dropping another
 * `kamogawa-example-N.jpeg` into the folder is the whole of adding one.
 */
const modules = import.meta.glob<string>('../../img/kamogawa/kamogawa-example-*.jpeg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Sorted by the number in the filename, so the order is the obvious one and
 * doesn't shift when a new photo is added in the middle. */
export const EXAMPLE_PHOTOS: string[] = Object.entries(modules)
  .sort(([a], [b]) => numberIn(a) - numberIn(b))
  .map(([, url]) => url);

function numberIn(path: string): number {
  return Number(path.match(/-(\d+)\.jpeg$/)?.[1] ?? 0);
}

/**
 * A photo for `seed`, picked at random but always the *same* random one.
 *
 * Stable matters more than it sounds: a genuinely random pick would deal a card
 * a new picture on every render -- and the toukou board re-renders on every
 * simulation tick, so its cards would strobe. Hashing an id gives an
 * arbitrary-looking spread that never changes for a given post.
 */
export function examplePhoto(seed: string): string {
  if (EXAMPLE_PHOTOS.length === 0) return '';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return EXAMPLE_PHOTOS[h % EXAMPLE_PHOTOS.length];
}

/**
 * A Supabase-hosted photo, resized by the server to the width it's actually
 * drawn at.
 *
 * Every photo in the app is stored at up to 1600px because that's what a phone
 * camera hands over, and most of them render into a 112px card. A board of
 * fifty nodes was pulling ~14MB of images to draw about 0.5MB worth of pixels,
 * which is the whole of "it loads so slowly" -- and on riverbank signal it's
 * the difference between a board appearing and a board arriving.
 *
 * `width` should be roughly twice the CSS size, so it still looks right on a
 * 2x/3x screen. Anything that isn't a Supabase public object URL -- a bundled
 * example photo, a blob: preview -- is handed back untouched.
 *
 * `resize=contain` is load-bearing, not a default worth trimming. Asking for a
 * width and nothing else does NOT scale the image: the transformer sets the
 * width to what you asked and leaves the HEIGHT AT THE ORIGINAL, so a
 * 6000x3376 photo comes back 900x3376 -- the same picture squeezed to a
 * seventh of its width. On screen that's a tall thin sliver of colour-bar,
 * which is what "my photo is cut off" turned out to mean. `contain` scales the
 * other side to match and returns 900x506.
 *
 * It is also eight times smaller: the squeezed version was 91KB of a
 * 900x3376 canvas, against 11KB for the same photo at its real shape.
 */
export function thumb(url: string, width: number): string {
  const marker = '/storage/v1/object/public/';
  if (!url.includes(marker)) return url;
  return `${url.replace(marker, '/storage/v1/render/image/public/')}?width=${width}&resize=contain&quality=72`;
}

/**
 * The longest edge a stored photo needs. The biggest a photo is ever drawn is
 * the detail sheet at 900px, so 1600 leaves room for a 2x screen and for
 * cropping later without keeping a 6000px original nobody will ever see.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
/** Below this, re-encoding costs more than it saves. */
const SKIP_BELOW_BYTES = 600 * 1024;

/**
 * Shrink a camera photo to something a riverbank connection can actually send.
 *
 * Phones hand over enormous files -- the photos already in this app average
 * 6.4MB and the largest is 15MB -- and the app was uploading them untouched.
 * Over outdoor mobile signal that's a minute-long upload that can stall
 * outright, which is what "I can't upload pictures" was. It's also waste:
 * every one of those pixels is thrown away by the resize on the way back down.
 *
 * Failing safe matters more than shrinking here. Anything unexpected -- an
 * animated GIF, a browser without `createImageBitmap`, a canvas that won't
 * encode, a result that somehow came out bigger -- returns the original file
 * and lets the upload proceed as it always did. A photo that uploads slowly is
 * a nuisance; a photo that vanishes because the resize threw is a lost moment
 * on the riverbank.
 *
 * `imageOrientation: 'from-image'` is what keeps phone photos the right way up:
 * the EXIF rotation flag lives in the file, and drawing to a canvas without
 * honouring it is the classic way to turn everyone's portrait shots sideways.
 */
export async function prepareForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file; // re-encoding would drop the animation
  if (file.size <= SKIP_BELOW_BYTES) return file;
  if (typeof createImageBitmap !== 'function') return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
