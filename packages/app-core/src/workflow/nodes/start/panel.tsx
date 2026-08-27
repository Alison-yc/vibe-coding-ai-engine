import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Label, Select } from '@ai-engine/ui';
import { StartNodeConfigSchema } from '@ai-engine/contracts';
import { formatConfigValue, PanelSection } from '../common';
import type { NodePanelProps } from '../types';
import { flushConfigDraft, stageConfigDraft } from '../use-config-draft';
import { startDefaultConfig } from './default';

export const StartNodePanel = ({ node, onChange }: NodePanelProps) => {
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
    <PanelSection title="运行入参" description="运行时根据这些字段生成输入表单">
      {fields.fields.map((field, index) => (
        <div className="border-border flex flex-col gap-2 rounded-md border p-3" key={field.id}>
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label={`字段 ${index + 1} 名称`}
              {...form.register(`fields.${index}.name`)}
            />
            <Select
              aria-label={`字段 ${index + 1} 类型`}
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
            aria-label={`字段 ${index + 1} 默认值`}
            defaultValue={formatConfigValue(field.defaultValue)}
            placeholder="可选默认值"
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
            必填
          </Label>
          <Button size="sm" variant="ghost" onClick={() => fields.remove(index)}>
            删除字段
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
        添加输入字段
      </Button>
    </PanelSection>
  );
};
