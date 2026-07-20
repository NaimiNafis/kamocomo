import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OnboardingFields } from '../../lib/identity';

const NATIONALITIES = ['japan', 'asia', 'europe', 'americas', 'other'] as const;
const AGE_RANGES = ['under18', '18-24', '25-34', '35-44', '45-59', '60plus'] as const;
const GENDERS = ['female', 'male', 'other', 'unspecified'] as const;

interface OnboardingProps {
  onComplete: (fields: OnboardingFields) => void;
}

/**
 * §5.2 onboarding modal: nationality/age/gender as one-tap chip selects,
 * shown once (gated by profile completeness, not session state, so it never
 * reappears once answered on this device).
 */
export function Onboarding({ onComplete }: OnboardingProps) {
  const { t } = useTranslation();
  const [nationality, setNationality] = useState<string | null>(null);
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);

  const canContinue = nationality && ageRange && gender;

  function handleContinue() {
    if (!nationality || !ageRange || !gender) return;
    onComplete({ nationality, age_range: ageRange, gender });
  }

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-kamo-ink/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-kamo-stone p-6 text-kamo-ink shadow-xl">
        <h2 className="font-display text-xl">{t('onboarding.title')}</h2>
        <p className="mt-1 font-ui text-sm text-kamo-ink/70">{t('onboarding.subtitle')}</p>

        <ChipGroup
          label={t('onboarding.nationality')}
          options={NATIONALITIES}
          value={nationality}
          onChange={setNationality}
          getLabel={(v) => t(`onboarding.nationalityOptions.${v}`)}
        />
        <ChipGroup
          label={t('onboarding.ageRange')}
          options={AGE_RANGES}
          value={ageRange}
          onChange={setAgeRange}
          getLabel={(v) => t(`onboarding.ageRangeOptions.${v}`)}
        />
        <ChipGroup
          label={t('onboarding.gender')}
          options={GENDERS}
          value={gender}
          onChange={setGender}
          getLabel={(v) => t(`onboarding.genderOptions.${v}`)}
        />

        <button
          type="button"
          disabled={!canContinue}
          onClick={handleContinue}
          className="mt-6 w-full rounded-full bg-kamo-indigo py-2.5 font-ui text-sm font-medium text-kamo-stone transition-opacity disabled:opacity-40"
        >
          {t('onboarding.continue')}
        </button>
      </div>
    </div>
  );
}

interface ChipGroupProps {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (value: string) => void;
  getLabel: (value: string) => string;
}

function ChipGroup({ label, options, value, onChange, getLabel }: ChipGroupProps) {
  return (
    <div className="mt-4">
      <p className="font-ui text-xs font-medium uppercase tracking-wide text-kamo-ink/60">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-full border px-3 py-1.5 font-ui text-sm transition-colors ${
              value === option
                ? 'border-kamo-indigo bg-kamo-indigo text-kamo-stone'
                : 'border-kamo-ink/20 bg-transparent text-kamo-ink'
            }`}
          >
            {getLabel(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
