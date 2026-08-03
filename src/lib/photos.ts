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
