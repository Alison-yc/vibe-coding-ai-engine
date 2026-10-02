import { Card, CardContent, CardDescription, CardFooter, CardHeader, Label } from '@ai-engine/ui';
import type { ReactNode } from 'react';
import { AppLayout } from '../components/page-shell';
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
    <AppLayout>
      <main className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
        <div className="my-auto w-full max-w-[26rem] min-w-0">
          <Card className="w-full min-w-0">
            <CardHeader className="gap-2 p-5 pb-0 sm:p-6 sm:pb-0">
              <h1 className="text-lg leading-tight font-semibold tracking-tight">{title}</h1>
              <CardDescription className="text-pretty">{description}</CardDescription>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
              {status === 'unavailable' ? (
                <p className="text-destructive text-sm" role="alert">
                  {t('unavailable')}
                </p>
              ) : null}
              {children}
            </CardContent>
            {footer ? (
              <CardFooter className="flex-wrap justify-center gap-x-4 gap-y-2 border-t p-5 sm:px-6">
                {footer}
              </CardFooter>
            ) : null}
          </Card>
        </div>
      </main>
    </AppLayout>
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
