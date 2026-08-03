import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createActivityType, deleteActivityType, type ActivityType } from '../../lib/toukou';

export interface ComposerResult {
  activityTypeId: string | null;
  phrase: string;
  photoFile: File | null;
}

interface ComposerProps {
  mode: 'main' | 'sub';
  activityTypes: ActivityType[]; // only used for 'main'
  /** A type the visitor just invented, so the picker can show it immediately
   * without waiting for a refetch. */
  onTypeCreated: (type: ActivityType) => void;
  /** One they took back again. */
  onTypeRemoved: (id: string) => void;
  submitting: boolean;
  error: boolean;
  onSubmit: (result: ComposerResult) => void;
  onCancel: () => void;
}

/**
 * Shared composer for creating a main or a sub (§5.5). Mains pick an activity
 * type; subs inherit their parent's, so the type picker is main-only. A photo
 * is required in both.
 */
export function Composer({
  mode,
  activityTypes,
  onTypeCreated,
  onTypeRemoved,
  submitting,
  error,
  onSubmit,
  onCancel,
}: ComposerProps) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language.startsWith('ja');
  const [activityTypeId, setActivityTypeId] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [creatingType, setCreatingType] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Add a type the seeded list doesn't cover. The colour is chosen server-side
   * from the §4.1 palette, so the board can't end up with an off-brand hue. */
  async function submitCustomType() {
    const name = customName.trim();
    if (!name || creatingType) return;
    setCreatingType(true);
    try {
      const created = await createActivityType(name);
      if (created) {
        onTypeCreated(created);
        setActivityTypeId(created.id);
        setCustomOpen(false);
        setCustomName('');
      }
    } catch {
      /* leave the field open so it can be retried */
    } finally {
      setCreatingType(false);
    }
  }

  const [removeNote, setRemoveNote] = useState<string | null>(null);

  const photoPreview = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  );

  // A photo is required, not optional: the board is a picture of what the
  // riverbank looks like right now, and text-only cards fall back to the shared
  // placeholder, which makes every one of them look like the same post.
  const canSubmit =
    !submitting &&
    phrase.trim().length > 0 &&
    photoFile !== null &&
    (mode === 'sub' || activityTypeId !== null);

  /**
   * Take back a type this device added. The server deletes it if nothing has
   * been posted with it and retires it if something has -- either way it leaves
   * the picker, so both are treated the same here.
   *
   * Anything else says so out loud. This used to swallow every refusal, which
   * meant the common case -- adding a type while posting, then trying to remove
   * it once it had that one post attached -- looked exactly like a dead button.
   */
  async function removeType(id: string) {
    setRemoveNote(null);
    const status = await deleteActivityType(id).catch(() => 'failed' as const);
    if (status === 'deleted' || status === 'retired') {
      onTypeRemoved(id);
      if (activityTypeId === id) setActivityTypeId(null);
      return;
    }
    setRemoveNote(status === 'not_yours' ? t('composer.removeNotYours') : t('composer.removeFailed'));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ activityTypeId, phrase: phrase.trim(), photoFile });
  }

  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-kamo-ink/50 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-kamo-stone p-5 text-kamo-ink shadow-xl">
        <h2 className="font-display text-lg">
          {mode === 'main' ? t('composer.mainTitle') : t('composer.subTitle')}
        </h2>

        {mode === 'main' && (
          <div className="mt-3">
            <p className="font-ui text-xs font-medium uppercase tracking-wide text-kamo-ink/60">
              {t('composer.activityType')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {activityTypes.map((type) => {
                const selected = activityTypeId === type.id;
                return (
                  <span
                    key={type.id}
                    className="flex items-center rounded-full border pr-1 font-ui text-sm"
                    style={{
                      borderColor: selected ? type.color : 'rgba(28,28,26,0.2)',
                      backgroundColor: selected ? type.color : 'transparent',
                      color: selected ? '#E9E4D8' : '#1C1C1A',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActivityTypeId(type.id)}
                      className="flex items-center gap-1.5 py-1.5 pl-3 pr-1.5"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: type.color }}
                      />
                      {isJa ? type.name_ja : type.name_en}
                    </button>
                    {/* Only on types this device added -- the seeded ones aren't
                        anyone's to remove. */}
                    {type.mine && (
                      <button
                        type="button"
                        onClick={() => void removeType(type.id)}
                        aria-label={t('composer.removeType')}
                        title={t('composer.removeType')}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-xs transition-transform duration-150 active:scale-90"
                        style={{ color: selected ? '#E9E4D8' : 'rgba(28,28,26,0.55)' }}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomOpen((v) => !v)}
                aria-expanded={customOpen}
                className="rounded-full border border-dashed border-kamo-ink/30 px-3 py-1.5 font-ui text-sm text-kamo-ink/70"
              >
                + {t('composer.otherType')}
              </button>
            </div>
            {removeNote && (
              <p className="mt-2 font-ui text-xs text-kamo-sunset">{removeNote}</p>
            )}

            {customOpen && (
              <div className="mt-2 flex gap-2">
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void submitCustomType();
                    }
                  }}
                  placeholder={t('composer.otherTypePlaceholder')}
                  maxLength={24}
                  className="min-w-0 flex-1 rounded-lg border border-kamo-ink/15 bg-white/60 px-2 py-1.5 font-ui text-sm outline-none focus:border-kamo-river"
                />
                <button
                  type="button"
                  onClick={() => void submitCustomType()}
                  disabled={!customName.trim() || creatingType}
                  className="shrink-0 rounded-full bg-kamo-indigo px-3 py-1.5 font-ui text-sm text-kamo-stone disabled:opacity-40"
                >
                  {t('composer.otherTypeAdd')}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <label className="font-ui text-xs font-medium uppercase tracking-wide text-kamo-ink/60">
            {t('composer.phrase')}
          </label>
          <textarea
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={t('composer.phrasePlaceholder')}
            rows={2}
            maxLength={140}
            className="mt-1 w-full resize-none rounded-lg border border-kamo-ink/15 bg-white/60 p-2 font-ui text-sm outline-none focus:border-kamo-river"
          />
        </div>

        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 font-ui text-sm text-kamo-river"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="" className="h-10 w-10 rounded object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded bg-kamo-sand/60 text-lg">
                +
              </span>
            )}
            {photoFile ? t('composer.changePhoto') : t('composer.addPhoto')}
          </button>
          {!photoFile && (
            <p className="mt-1 font-ui text-xs text-kamo-ink/50">{t('composer.photoRequired')}</p>
          )}
        </div>

        {error && <p className="mt-3 font-ui text-sm text-kamo-sunset">{t('composer.error')}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-full border border-kamo-ink/20 py-2.5 font-ui text-sm disabled:opacity-40"
          >
            {t('composer.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 rounded-full bg-kamo-indigo py-2.5 font-ui text-sm font-medium text-kamo-stone transition-opacity disabled:opacity-40"
          >
            {submitting ? t('composer.submitting') : t('composer.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
