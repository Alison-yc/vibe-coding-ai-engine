import type { ReactNode } from 'react';
import { Badge, Input, Label } from '@ai-engine/ui';
import type { NodeBodyProps } from './types';

export const NodeSummary = ({ data, children }: NodeBodyProps & { children?: ReactNode }) => (
  <div className="flex w-44 min-w-0 flex-col gap-2">
    <div className="flex items-center justify-between gap-2">
      <strong className="truncate text-sm">{data.title ?? data.type}</strong>
      <Badge variant="secondary">{data.type}</Badge>
    </div>
    {children ? <div className="text-muted-foreground line-clamp-2 text-xs">{children}</div> : null}
  </div>
);

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
