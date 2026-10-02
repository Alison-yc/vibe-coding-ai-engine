import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Label, Select } from '@ai-engine/ui';
import { StartNodeConfigSchema } from '@ai-engine/contracts';
import { useTranslation } from 'react-i18next';
import { formatConfigValue, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { flushConfigDraft, stageConfigDraft } from '../use-config-draft';
import { startDefaultConfig } from './default';

export const StartNodePanel = ({ node, onChange }: NodePanelProps) => {
  const { t } = useTranslation('workflow');
  const parsed = StartNodeConfigSchema.safeParse(node.data.config);
  const form = useForm({
    resolver: zodResolver(StartNodeConfigSchema),
    mode: 'onChange',
    defaultValues: parsed.success ? parsed.data : StartNodeConfigSchema.parse(startDefaultConfig),
  });
  const fields = useFieldArray({ control: form.control, name: 'fields' });
  useEffect(() => {
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    // React Hook Form 的订阅式 watch 用于把表单与画布渲染解耦，不向 memo 组件传递其返回函数。
    // eslint-disable-next-line react-hooks/incompatible-library
    const subscription = form.watch((value) => {
      if (timer) globalThis.clearTimeout(timer);
      stageConfigDraft(node.id, value, onChange);
      timer = globalThis.setTimeout(() => {
        flushConfigDraft(node.id);
      }, 400);
    });
    return () => {
      subscription.unsubscribe();
      if (timer) globalThis.clearTimeout(timer);
      flushConfigDraft(node.id);
    };
  }, [form, node.id, onChange]);
  return (
    <PanelSection title={t('panels.start.title')} description={t('panels.start.description')}>
      {fields.fields.map((field, index) => (
        <div className="border-border flex flex-col gap-2 rounded-md border p-3" key={field.id}>
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label={t('panels.start.fieldName', { index: index + 1 })}
              {...form.register(`fields.${index}.name`)}
            />
            <Select
              aria-label={t('panels.start.fieldType', { index: index + 1 })}
              {...form.register(`fields.${index}.type`)}
            >
              {['string', 'number', 'boolean', 'object', 'array'].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>
          <Input
            aria-label={t('panels.start.defaultValue', { index: index + 1 })}
            defaultValue={formatConfigValue(field.defaultValue)}
            placeholder={t('panels.start.defaultPlaceholder')}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                form.setValue(`fields.${index}.defaultValue`, undefined, { shouldValidate: true });
                return;
              }
              try {
                form.setValue(`fields.${index}.defaultValue`, JSON.parse(value) as unknown, {
                  shouldValidate: true,
                });
              } catch {
                form.setValue(`fields.${index}.defaultValue`, value, { shouldValidate: true });
              }
            }}
          />
          <Label className="flex items-center gap-2 text-xs">
            <input type="checkbox" {...form.register(`fields.${index}.required`)} />
            {t('panels.start.required')}
          </Label>
          <Button size="sm" variant="ghost" onClick={() => fields.remove(index)}>
            {t('panels.start.delete')}
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          fields.append({
            name: `input_${fields.fields.length + 1}`,
            type: 'string',
            required: true,
          })
        }
      >
        {t('panels.start.add')}
      </Button>
    </PanelSection>
  );
};
