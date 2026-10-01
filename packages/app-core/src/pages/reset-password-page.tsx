import type { ResetPasswordRequest } from '@ai-engine/contracts';
import { usePlatform } from '@ai-engine/platform';
import { Button, Input } from '@ai-engine/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { resetPassword } from '../auth/auth-api';
import {
  inferIdentityType,
  isValidCode,
  isValidPassword,
  parseIdentifier,
  type AuthFieldError,
} from '../auth/auth-form';
import { AuthField, AuthFormError, AuthPageLayout } from '../auth/auth-page-layout';
import { CodeInputRow } from '../auth/code-input-row';
import { AUTH_ME_QUERY_KEY } from '../auth/use-auth';
import { AUTH_LINK_CLASS_NAME, useRedirectQuery } from '../auth/use-redirect-query';
import { useFeatureTranslation } from '../i18n/feature-resources';
import { localizeApiError } from '../i18n/localize-api-error';

export const ResetPasswordPage = () => {
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const { query } = useRedirectQuery();
  const { t } = useFeatureTranslation('auth');
  const { t: errorT } = useFeatureTranslation('errors');
  const [rawIdentifier, setRawIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<AuthFieldError | null>(null);
  const identifier = parseIdentifier(inferIdentityType(rawIdentifier), rawIdentifier);

  const submit = useMutation({
    mutationFn: (input: ResetPasswordRequest) => resetPassword(platform, input),
    // 重置会注销该账号全部会话；若重置的是当前账号，重新校验后会自动回到访客身份。
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY }),
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!identifier) return setFieldError('identifier');
    if (!isValidCode(code)) return setFieldError('code');
    if (!isValidPassword(password)) return setFieldError('password');
    if (password !== confirm) return setFieldError('confirmMismatch');
    setFieldError(null);
    submit.mutate({ ...identifier, code: code.trim(), password });
  };

  const toLogin = (
    <Link className={AUTH_LINK_CLASS_NAME} to={`/login${query}`}>
      {t('reset.toLogin')}
    </Link>
  );

  if (submit.isSuccess) {
    return (
      <AuthPageLayout
        title={t('reset.title')}
        description={t('reset.description')}
        footer={toLogin}
      >
        <p className="text-sm" role="status">
          {t('reset.success')}
        </p>
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout title={t('reset.title')} description={t('reset.description')} footer={toLogin}>
      <form className="flex min-w-0 flex-col gap-4" noValidate onSubmit={onSubmit}>
        <AuthField id="reset-identifier" label={t('identifier.label')}>
          <Input
            id="reset-identifier"
            autoComplete="username"
            value={rawIdentifier}
            placeholder={t('identifier.placeholder')}
            onChange={(event) => setRawIdentifier(event.target.value)}
          />
        </AuthField>
        <AuthField id="reset-code" label={t('fields.code')}>
          <CodeInputRow
            id="reset-code"
            value={code}
            onChange={setCode}
            purpose="reset_password"
            identifier={identifier}
            onInvalidIdentifier={() => setFieldError('identifier')}
          />
        </AuthField>
        <AuthField id="reset-password" label={t('fields.newPassword')}>
          <Input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </AuthField>
        <AuthField id="reset-confirm" label={t('fields.confirmPassword')}>
          <Input
            id="reset-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </AuthField>
        <AuthFormError
          message={
            fieldError
              ? t(`validation.${fieldError}`)
              : submit.error
                ? localizeApiError(submit.error, errorT)
                : null
          }
        />
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending ? t('reset.submitting') : t('reset.submit')}
        </Button>
      </form>
    </AuthPageLayout>
  );
};
