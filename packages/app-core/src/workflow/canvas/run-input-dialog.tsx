import { useState } from 'react';
import { Button, Input, Label } from '@ai-engine/ui';
import type { StartNodeConfig } from '@ai-engine/contracts';

type StartInputField = StartNodeConfig['fields'][number];
const parseValue = (field: StartInputField, value: string): unknown => {
  if (field.type === 'number') return Number(value);
  if (field.type === 'boolean') return value === 'true';
  if (field.type === 'object' || field.type === 'array') return JSON.parse(value) as unknown;
  return value;
};

export const RunInputDialog = ({
  fields,
  onClose,
  onRun,
}: {
  fields: StartInputField[];
  onClose: () => void;
  onRun: (inputs: Record<string, unknown>) => void;
}) => {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.name,
        field.defaultValue === undefined
          ? ''
          : typeof field.defaultValue === 'string'
            ? field.defaultValue
            : JSON.stringify(field.defaultValue),
      ]),
    ),
  );
  const [error, setError] = useState('');
  return (
    <div className="bg-background/80 absolute inset-0 z-20 grid place-items-center backdrop-blur-sm">
      <form
        className="border-border bg-card flex w-full max-w-md flex-col gap-4 rounded-lg border p-5 shadow-lg"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const inputs = Object.fromEntries(
              fields.map((field) => [field.name, parseValue(field, values[field.name] ?? '')]),
            );
            setError('');
            onRun(inputs);
          } catch {
            setError('对象和数组请输入合法 JSON');
          }
        }}
      >
        <div>
          <h2 className="font-semibold">运行工作流</h2>
          <p className="text-muted-foreground text-sm">填写开始节点定义的输入参数</p>
        </div>
        {fields.map((field) => (
          <div className="flex flex-col gap-1.5" key={field.name}>
            <Label htmlFor={`run-${field.name}`}>
              {field.name}
              {field.required ? ' *' : ''}
            </Label>
            {field.type === 'boolean' ? (
              <select
                id={`run-${field.name}`}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={values[field.name] ?? 'false'}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.name]: event.target.value }))
                }
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : (
              <Input
                id={`run-${field.name}`}
                required={field.required}
                type={field.type === 'number' ? 'number' : 'text'}
                value={values[field.name] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.name]: event.target.value }))
                }
              />
            )}
          </div>
        ))}
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button type="submit">开始运行</Button>
        </div>
      </form>
    </div>
  );
};
