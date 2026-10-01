import type { IdentifierInput, VerificationPurpose } from '@ai-engine/contracts';
import { usePlatform } from '@ai-engine/platform';
import { Button } from '@ai-engine/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useFeatureTranslation } from '../i18n/feature-resources';
import { localizeApiError } from '../i18n/localize-api-error';
import { sendVerificationCode } from './auth-api';

export const SendCodeButton = ({
  purpose,
  identifier,
  onInvalidIdentifier,
}: {
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
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1_000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const label = remaining > 0 ? t('code.resendIn', { seconds: remaining }) : t('code.send');

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        className="shrink-0 sm:min-w-32"
        disabled={send.isPending || remaining > 0}
        onClick={() => {
          if (!identifier) {
            onInvalidIdentifier();
            return;
          }
          send.mutate(identifier);
        }}
      >
        <span className="truncate">{label}</span>
      </Button>
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
