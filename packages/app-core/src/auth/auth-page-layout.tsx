import { Card, CardContent, Label } from '@ai-engine/ui';
import type { ReactNode } from 'react';
import { PageShell } from '../components/page-shell';
import { useFeatureTranslation } from '../i18n/feature-resources';
import { useAuth } from './use-auth';

export const AuthPageLayout = ({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) => {
  const { status } = useAuth();
  const { t } = useFeatureTranslation('auth');
  return (
    <PageShell title={title} description={description}>
      <Card className="w-full max-w-md min-w-0">
        <CardContent className="flex min-w-0 flex-col gap-4">
          {status === 'unavailable' ? (
            <p className="text-destructive text-sm" role="alert">
              {t('unavailable')}
            </p>
          ) : null}
          {children}
        </CardContent>
      </Card>
      {footer ? <div className="flex max-w-md flex-wrap gap-4 text-sm">{footer}</div> : null}
    </PageShell>
  );
};

export const AuthField = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) => (
  <div className="flex min-w-0 flex-col gap-2">
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);

export const AuthFormError = ({ message }: { message: string | null }) =>
  message ? (
    <p className="text-destructive text-sm" role="alert">
      {message}
    </p>
  ) : null;
