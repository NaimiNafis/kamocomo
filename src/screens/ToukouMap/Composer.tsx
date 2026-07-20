import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityType } from '../../lib/toukou';

export interface ComposerResult {
  activityTypeId: string | null;
  phrase: string;
  photoFile: File | null;
}

interface ComposerProps {
  mode: 'main' | 'sub';
  activityTypes: ActivityType[]; // only used for 'main'
  submitting: boolean;
  error: boolean;
  onSubmit: (result: ComposerResult) => void;
  onCancel: () => void;
}

/**
 * Shared composer for creating a main or a sub (§5.5). Mains pick an activity
 * type; subs inherit their parent's, so the type picker is main-only. Photo
 * is optional in both.
 */
export function Composer({
  mode,
  activityTypes,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const photoPreview = useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  );

  const canSubmit =
    !submitting && phrase.trim().length > 0 && (mode === 'sub' || activityTypeId !== null);

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
              {activityTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setActivityTypeId(type.id)}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-ui text-sm"
                  style={{
                    borderColor: activityTypeId === type.id ? type.color : 'rgba(28,28,26,0.2)',
                    backgroundColor: activityTypeId === type.id ? type.color : 'transparent',
                    color: activityTypeId === type.id ? '#E9E4D8' : '#1C1C1A',
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: type.color }}
                  />
                  {isJa ? type.name_ja : type.name_en}
                </button>
              ))}
            </div>
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
          <p className="mt-1 font-ui text-xs text-kamo-ink/50">{t('composer.photoOptional')}</p>
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
