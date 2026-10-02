import type { IdentifierInput, VerificationPurpose } from '@ai-engine/contracts';
import { usePlatform } from '@ai-engine/platform';
import { Button, Input } from '@ai-engine/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useFeatureTranslation } from '../i18n/feature-resources';
import { localizeApiError } from '../i18n/localize-api-error';
import { sendVerificationCode } from './auth-api';

export const CodeInputRow = ({
  id,
  value,
  onChange,
  purpose,
  identifier,
  onInvalidIdentifier,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  purpose: VerificationPurpose;
  identifier: IdentifierInput | null;
  onInvalidIdentifier: () => void;
}) => {
  const platform = usePlatform();
  const { t } = useFeatureTranslation('auth');
  const { t: errorT } = useFeatureTranslation('errors');
  const [remaining, setRemaining] = useState(0);
  const send = useMutation({
    mutationFn: (input: IdentifierInput) => sendVerificationCode(platform, { ...input, purpose }),
    onSuccess: (response) => setRemaining(response.resendAfterSec),
  });

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((seconds) => seconds - 1), 1_000);
    return () => clearTimeout(timer);
  }, [remaining]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="min-w-0 sm:flex-1"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full shrink-0 sm:w-32"
          disabled={send.isPending || remaining > 0}
          onClick={() => {
            if (!identifier) {
              onInvalidIdentifier();
              return;
            }
            send.mutate(identifier);
          }}
        >
          <span className="truncate">
            {remaining > 0 ? t('code.resendIn', { seconds: remaining }) : t('code.send')}
          </span>
        </Button>
      </div>
      {send.data ? (
        <p className="text-muted-foreground text-xs" role="status">
          {t('code.sent', { minutes: Math.ceil(send.data.expiresInSec / 60) })}{' '}
          {t('code.staticHint')}
        </p>
      ) : null}
      {send.error ? (
        <p className="text-destructive text-xs" role="alert">
          {localizeApiError(send.error, errorT)}
        </p>
      ) : null}
    </div>
  );
};
