import { supabase } from './supabase';
import { subShade } from './toukou';

export interface ArchivePlaceCard {
  id: string;
  nameEn: string;
  nameJa: string;
  /** The most recent photo posted there, standing in for the place. */
  photoUrl: string | null;
  mainCount: number;
}

export interface ArchiveMainCard {
  id: string;
  color: string;
  placeId: string | null;
  placeNameEn: string;
  placeNameJa: string;
  typeNameEn: string;
  typeNameJa: string;
  photoUrl: string | null;
  phrase: string | null;
  likes: number;
  dislikes: number;
  subCount: number; // non-hidden subs, live + archived
  createdAt: string;
}

export interface ArchiveSub {
  id: string;
  color: string;
  photoUrl: string | null;
  phrase: string | null;
  archived: boolean;
  createdAt: string;
}

export interface MainHistory {
  main: ArchiveMainCard;
  subs: ArchiveSub[]; // chronological (oldest first)
}

interface TypeInfo {
  color: string;
  name_en: string;
  name_ja: string;
}

async function fetchTypeMap(): Promise<Map<string, TypeInfo>> {
  const { data, error } = await supabase.from('activity_types').select('id, color, name_en, name_ja');
  if (error) throw error;
  return new Map(data.map((t) => [t.id, { color: t.color, name_en: t.name_en, name_ja: t.name_ja }]));
}

const FALLBACK_TYPE: TypeInfo = { color: '#6e8ca0', name_en: 'Activity', name_ja: '活動' };

interface PlaceInfo {
  name_en: string;
  name_ja: string;
}

async function fetchPlaceMap(): Promise<Map<string, PlaceInfo>> {
  const { data, error } = await supabase.from('places').select('id, name_en, name_ja');
  if (error) throw error;
  return new Map(data.map((p) => [p.id, { name_en: p.name_en, name_ja: p.name_ja }]));
}

/**
 * The log's front page: the eight places, each standing for everything posted
 * there.
 *
 * The log used to open on every main ever posted, newest first, which is a feed
 * rather than a record -- you could scroll it but not ask it anything. Places
 * are the question people actually have ("what happens at Sanjo?"), and they're
 * a fixed, small set, so they make a front page that doesn't grow.
 *
 * A place's picture is the most recent photo posted there, so the page ages
 * with the river rather than showing the same eight stills forever.
 */
export async function fetchArchivePlaces(): Promise<ArchivePlaceCard[]> {
  const [{ data: places, error: placesError }, { data: mains, error: mainsError }] =
    await Promise.all([
      supabase
        .from('places')
        .select('id, name_en, name_ja')
        .eq('active', true)
        .order('lat', { ascending: false }),
      supabase
        .from('activities')
        .select('place_id, photo_url, created_at')
        .eq('kind', 'main')
        .eq('hidden', false)
        .order('created_at', { ascending: false }),
    ]);
  if (placesError) throw placesError;
  if (mainsError) throw mainsError;

  const counts = new Map<string, number>();
  const newestPhoto = new Map<string, string>();
  for (const m of mains) {
    if (!m.place_id) continue;
    counts.set(m.place_id, (counts.get(m.place_id) ?? 0) + 1);
    // Mains arrive newest-first, so the first photo seen for a place is its
    // most recent one.
    if (m.photo_url && !newestPhoto.has(m.place_id)) newestPhoto.set(m.place_id, m.photo_url);
  }

  return places.map((p) => ({
    id: p.id,
    nameEn: p.name_en,
    nameJa: p.name_ja,
    photoUrl: newestPhoto.get(p.id) ?? null,
    mainCount: counts.get(p.id) ?? 0,
  }));
}

/**
 * Every non-hidden main as a browsable history card, newest first, with its
 * total (live + archived) sub count.
 *
 * Narrowed to one place when `placeId` is given -- which is the normal way in,
 * from the log's front page. Without it you get everything, which is what the
 * "see all" route wants; each card names its place either way, so a post pulled
 * out of its board still says where it happened.
 */
export async function fetchArchiveMains(placeId?: string): Promise<ArchiveMainCard[]> {
  let query = supabase
    .from('activities')
    .select('id, activity_type, place_id, photo_url, phrase, likes, dislikes, created_at')
    .eq('kind', 'main')
    .eq('hidden', false)
    .order('created_at', { ascending: false });
  if (placeId) query = query.eq('place_id', placeId);

  const [types, placeNames, { data: mains, error: mainsError }, { data: subs, error: subsError }] =
    await Promise.all([
      fetchTypeMap(),
      fetchPlaceMap(),
      query,
      supabase.from('activities').select('parent_id').eq('kind', 'sub').eq('hidden', false),
    ]);
  if (mainsError) throw mainsError;
  if (subsError) throw subsError;

  const subCounts = new Map<string, number>();
  for (const s of subs) {
    if (s.parent_id) subCounts.set(s.parent_id, (subCounts.get(s.parent_id) ?? 0) + 1);
  }

  return mains.map((m) => {
    const type = types.get(m.activity_type) ?? FALLBACK_TYPE;
    const place = m.place_id ? placeNames.get(m.place_id) : undefined;
    return {
      id: m.id,
      color: type.color,
      placeId: m.place_id,
      placeNameEn: place?.name_en ?? '',
      placeNameJa: place?.name_ja ?? '',
      typeNameEn: type.name_en,
      typeNameJa: type.name_ja,
      photoUrl: m.photo_url,
      phrase: m.phrase,
      likes: m.likes,
      dislikes: m.dislikes,
      subCount: subCounts.get(m.id) ?? 0,
      createdAt: m.created_at,
    };
  });
}

/**
 * A single main's full history (§5.6): the main plus all its non-hidden subs
 * -- live *and* archived -- in chronological order, so it reads as the record
 * of how the spot was used over time. Returns null if the main is hidden or
 * missing.
 */
export async function fetchMainHistory(mainId: string): Promise<MainHistory | null> {
  const [types, placeNames, { data: main, error: mainError }, { data: subs, error: subsError }] =
    await Promise.all([
      fetchTypeMap(),
      fetchPlaceMap(),
      supabase
        .from('activities')
        .select('id, activity_type, place_id, photo_url, phrase, likes, dislikes, created_at')
        .eq('id', mainId)
        .eq('kind', 'main')
        .eq('hidden', false)
        .maybeSingle(),
      supabase
        .from('activities')
        .select('id, photo_url, phrase, archived, created_at')
        .eq('parent_id', mainId)
        .eq('kind', 'sub')
        .eq('hidden', false)
        .order('created_at', { ascending: true }),
    ]);
  if (mainError) throw mainError;
  if (subsError) throw subsError;
  if (!main) return null;

  const type = types.get(main.activity_type) ?? FALLBACK_TYPE;
  const place = main.place_id ? placeNames.get(main.place_id) : undefined;
  const subColor = subShade(type.color);

  return {
    main: {
      id: main.id,
      color: type.color,
      placeId: main.place_id,
      placeNameEn: place?.name_en ?? '',
      placeNameJa: place?.name_ja ?? '',
      typeNameEn: type.name_en,
      typeNameJa: type.name_ja,
      photoUrl: main.photo_url,
      phrase: main.phrase,
      likes: main.likes,
      dislikes: main.dislikes,
      subCount: subs.length,
      createdAt: main.created_at,
    },
    subs: subs.map((s) => ({
      id: s.id,
      color: subColor,
      photoUrl: s.photo_url,
      phrase: s.phrase,
      archived: s.archived,
      createdAt: s.created_at,
    })),
  };
}
