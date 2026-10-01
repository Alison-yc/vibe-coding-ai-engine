import type { IdentifierInput } from '@ai-engine/contracts';
import { usePlatform } from '@ai-engine/platform';
import { Button, Input, cn } from '@ai-engine/ui';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { loginWithCode, loginWithPassword } from '../auth/auth-api';
import {
  inferIdentityType,
  isValidCode,
  isValidPassword,
  parseIdentifier,
  type AuthFieldError,
} from '../auth/auth-form';
import { AuthField, AuthFormError, AuthPageLayout } from '../auth/auth-page-layout';
import { SendCodeButton } from '../auth/send-code-button';
import { useAuth } from '../auth/use-auth';
import { AUTH_LINK_CLASS_NAME, useRedirectQuery } from '../auth/use-redirect-query';
import { useFeatureTranslation } from '../i18n/feature-resources';
import { localizeApiError } from '../i18n/localize-api-error';

type LoginMode = 'password' | 'code';

type LoginInput =
  | { mode: 'password'; identifier: IdentifierInput; password: string }
  | { mode: 'code'; identifier: IdentifierInput; code: string };

export const LoginPage = () => {
  const platform = usePlatform();
  const auth = useAuth();
  const navigate = useNavigate();
  const { redirect, query } = useRedirectQuery();
  const { t } = useFeatureTranslation('auth');
  const { t: errorT } = useFeatureTranslation('errors');
  const [mode, setMode] = useState<LoginMode>('password');
  const [rawIdentifier, setRawIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<AuthFieldError | null>(null);
  const identifier = parseIdentifier(inferIdentityType(rawIdentifier), rawIdentifier);

  const submit = useMutation({
    mutationFn: async (input: LoginInput) => {
      const session =
        input.mode === 'password'
          ? await loginWithPassword(platform, { ...input.identifier, password: input.password })
          : await loginWithCode(platform, { ...input.identifier, code: input.code });
      await auth.applySession(session);
    },
    onSuccess: () => {
      void navigate(redirect, { replace: true });
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!identifier) return setFieldError('identifier');
    if (mode === 'password' && !isValidPassword(password)) return setFieldError('password');
    if (mode === 'code' && !isValidCode(code)) return setFieldError('code');
    setFieldError(null);
    submit.mutate(
      mode === 'password'
        ? { mode, identifier, password }
        : { mode, identifier, code: code.trim() },
    );
  };

  const switchMode = (next: LoginMode) => {
    setMode(next);
    setFieldError(null);
    submit.reset();
  };

  return (
    <AuthPageLayout
      title={t('login.title')}
      description={t('login.description')}
      footer={
        <>
          <Link className={AUTH_LINK_CLASS_NAME} to={`/register${query}`}>
            {t('login.toRegister')}
          </Link>
          <Link className={AUTH_LINK_CLASS_NAME} to={`/reset-password${query}`}>
            {t('login.toReset')}
          </Link>
        </>
      }
    >
      <div role="tablist" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        {(['password', 'code'] as const).map((item) => (
          <Button
            key={item}
            type="button"
            role="tab"
            size="sm"
            variant="ghost"
            aria-selected={mode === item}
            className={cn(mode === item && 'bg-background shadow-sm')}
            onClick={() => switchMode(item)}
          >
            {t(item === 'password' ? 'login.passwordTab' : 'login.codeTab')}
          </Button>
        ))}
      </div>
      <form className="flex min-w-0 flex-col gap-4" noValidate onSubmit={onSubmit}>
        <AuthField id="login-identifier" label={t('identifier.label')}>
          <Input
            id="login-identifier"
            autoComplete="username"
            value={rawIdentifier}
            placeholder={t('identifier.placeholder')}
            onChange={(event) => setRawIdentifier(event.target.value)}
          />
        </AuthField>
        {mode === 'password' ? (
          <AuthField id="login-password" label={t('fields.password')}>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </AuthField>
        ) : (
          <AuthField id="login-code" label={t('fields.code')}>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
              <Input
                id="login-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="min-w-0 flex-1"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <SendCodeButton
                purpose="login"
                identifier={identifier}
                onInvalidIdentifier={() => setFieldError('identifier')}
              />
            </div>
          </AuthField>
        )}
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
          {submit.isPending ? t('login.submitting') : t('login.submit')}
        </Button>
      </form>
    </AuthPageLayout>
  );
};
