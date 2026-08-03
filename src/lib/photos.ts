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
 */
export function thumb(url: string, width: number): string {
  const marker = '/storage/v1/object/public/';
  if (!url.includes(marker)) return url;
  return `${url.replace(marker, '/storage/v1/render/image/public/')}?width=${width}&quality=72`;
}
