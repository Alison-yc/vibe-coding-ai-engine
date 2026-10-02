import type { IdentityType, RegisterRequest } from '@ai-engine/contracts';
import { usePlatform } from '@ai-engine/platform';
import { Button, Input, cn } from '@ai-engine/ui';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { registerAccount } from '../auth/auth-api';
import {
  DISPLAY_NAME_MAX,
  isValidCode,
  isValidPassword,
  parseIdentifier,
  type AuthFieldError,
} from '../auth/auth-form';
import { AuthField, AuthFormError, AuthPageLayout } from '../auth/auth-page-layout';
import { CodeInputRow } from '../auth/code-input-row';
import { useAuth } from '../auth/use-auth';
import { AUTH_LINK_CLASS_NAME, useRedirectQuery } from '../auth/use-redirect-query';
import { useFeatureTranslation } from '../i18n/feature-resources';
import { localizeApiError } from '../i18n/localize-api-error';

export const RegisterPage = () => {
  const platform = usePlatform();
  const auth = useAuth();
  const navigate = useNavigate();
  const { redirect, query } = useRedirectQuery();
  const { t } = useFeatureTranslation('auth');
  const { t: errorT } = useFeatureTranslation('errors');
  const [type, setType] = useState<IdentityType>('email');
  const [rawIdentifier, setRawIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldError, setFieldError] = useState<AuthFieldError | null>(null);
  const identifier = parseIdentifier(type, rawIdentifier);

  const submit = useMutation({
    mutationFn: async (input: RegisterRequest) => {
      await auth.applySession(await registerAccount(platform, input));
    },
    onSuccess: () => {
      void navigate(redirect, { replace: true });
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = displayName.trim();
    if (!identifier) return setFieldError('identifier');
    if (!isValidCode(code)) return setFieldError('code');
    if (name.length > DISPLAY_NAME_MAX) return setFieldError('displayName');
    if (!isValidPassword(password)) return setFieldError('password');
    if (password !== confirm) return setFieldError('confirmMismatch');
    setFieldError(null);
    submit.mutate({
      ...identifier,
      code: code.trim(),
      password,
      ...(name ? { displayName: name } : {}),
    });
  };

  return (
    <AuthPageLayout
      title={t('register.title')}
      description={t('register.description')}
      footer={
        <Link className={AUTH_LINK_CLASS_NAME} to={`/login${query}`}>
          {t('register.toLogin')}
        </Link>
      }
    >
      <form className="flex min-w-0 flex-col gap-4" noValidate onSubmit={onSubmit}>
        <div
          role="radiogroup"
          aria-label={t('identifier.typeLabel')}
          className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
        >
          {(['email', 'phone'] as const).map((item) => (
            <Button
              key={item}
              type="button"
              role="radio"
              size="sm"
              variant="ghost"
              aria-checked={type === item}
              className={cn(type === item && 'bg-background shadow-sm')}
              onClick={() => {
                if (item === type) return;
                setType(item);
                setRawIdentifier('');
                setCode('');
                setDisplayName('');
                setPassword('');
                setConfirm('');
                setFieldError(null);
                submit.reset();
              }}
            >
              {t(item === 'email' ? 'identifier.email' : 'identifier.phone')}
            </Button>
          ))}
        </div>
        <AuthField
          id="register-identifier"
          label={t(type === 'email' ? 'identifier.email' : 'identifier.phone')}
        >
          <Input
            id="register-identifier"
            type={type === 'email' ? 'email' : 'tel'}
            autoComplete={type === 'email' ? 'email' : 'tel'}
            value={rawIdentifier}
            placeholder={t(
              type === 'email' ? 'identifier.emailPlaceholder' : 'identifier.phonePlaceholder',
            )}
            onChange={(event) => setRawIdentifier(event.target.value)}
          />
        </AuthField>
        <AuthField id="register-code" label={t('fields.code')}>
          <CodeInputRow
            key={type}
            id="register-code"
            value={code}
            onChange={setCode}
            purpose="register"
            identifier={identifier}
            onInvalidIdentifier={() => setFieldError('identifier')}
          />
        </AuthField>
        <AuthField id="register-display-name" label={t('fields.displayName')}>
          <Input
            id="register-display-name"
            autoComplete="nickname"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </AuthField>
        <AuthField id="register-password" label={t('fields.password')}>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </AuthField>
        <AuthField id="register-confirm" label={t('fields.confirmPassword')}>
          <Input
            id="register-confirm"
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
        <Button type="submit" className="w-full" disabled={submit.isPending}>
          {submit.isPending ? t('register.submitting') : t('register.submit')}
        </Button>
      </form>
    </AuthPageLayout>
  );
};
