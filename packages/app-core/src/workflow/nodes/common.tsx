import type { ReactNode } from 'react';
import { Badge, Input, Label, cn } from '@ai-engine/ui';
import { useTranslation } from 'react-i18next';
import { getNodePresentation } from './metadata';
import type { NodeBodyProps } from './types';
import { NodeIconMap, categoryAccentClass } from './visual';

export const NodeSummary = ({ data, children }: NodeBodyProps & { children?: ReactNode }) => {
  const { t } = useTranslation('workflow');
  const presentation = getNodePresentation(t, data.type);
  const { category } = presentation;
  const typeLabel = t(`canvas.categories.${category}`);
  const Icon = NodeIconMap[data.type];
  return (
    <div className="flex w-48 min-w-0 flex-col gap-2">
      <div
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-1 rounded-t-[calc(var(--radius-lg)-2px)]',
          categoryAccentClass[category],
        )}
      />
      <div className="flex items-start gap-2 pt-0.5">
        <span
          className={cn(
            'bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-md',
            category === 'ai' && 'text-primary bg-primary/10',
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <strong className="truncate text-sm">{data.title ?? presentation.title}</strong>
          <div className="flex min-w-0 flex-wrap gap-1">
            <Badge variant="secondary" className="max-w-full truncate">
              {typeLabel}
            </Badge>
            <Badge variant="outline" className="max-w-full truncate">
              {presentation.title}
            </Badge>
          </div>
        </div>
      </div>
      {children ? (
        <div className="text-muted-foreground line-clamp-2 pl-10 text-xs">{children}</div>
      ) : null}
    </div>
  );
};

export const PanelSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
    </div>
    {children}
  </section>
);

export const StringField = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label>{label}</Label>
    <Input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  </div>
);

export const formatConfigValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
};

export const configWithDraft = <T extends Record<string, unknown>>(
  fallback: T,
  draft: Record<string, unknown>,
): T => ({ ...fallback, ...draft });
