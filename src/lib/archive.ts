import { supabase } from './supabase';
import { subShade } from './toukou';

export interface ArchiveMainCard {
  id: string;
  color: string;
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

/**
 * The archive grid (§5.6): every non-hidden main as a browsable history card,
 * newest first, with its total (live + archived) sub count.
 */
export async function fetchArchiveMains(): Promise<ArchiveMainCard[]> {
  const [types, { data: mains, error: mainsError }, { data: subs, error: subsError }] =
    await Promise.all([
      fetchTypeMap(),
      supabase
        .from('activities')
        .select('id, activity_type, photo_url, phrase, likes, dislikes, created_at')
        .eq('kind', 'main')
        .eq('hidden', false)
        .order('created_at', { ascending: false }),
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
    return {
      id: m.id,
      color: type.color,
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
  const [types, { data: main, error: mainError }, { data: subs, error: subsError }] =
    await Promise.all([
      fetchTypeMap(),
      supabase
        .from('activities')
        .select('id, activity_type, photo_url, phrase, likes, dislikes, created_at')
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
  const subColor = subShade(type.color);

  return {
    main: {
      id: main.id,
      color: type.color,
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
