import { Upload } from 'lucide-react';
import { type ChangeEvent, type InputHTMLAttributes, useId, useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './button';

export type FileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  buttonLabel?: string;
  emptyHint?: string;
};

export const FileInput = ({
  className,
  buttonLabel = '选择文件',
  emptyHint = '未选择文件',
  accept,
  onChange,
  ...props
}: FileInputProps) => {
  const id = useId();
  const [fileName, setFileName] = useState<string | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileName(file?.name ?? null);
    onChange?.(event);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <Button type="button" variant="outline" className="relative" asChild>
        <label htmlFor={id} className="cursor-pointer">
          <Upload aria-hidden className="size-4" />
          {buttonLabel}
        </label>
      </Button>
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={handleChange}
        {...props}
      />
      <span className="text-muted-foreground text-sm">{fileName ?? emptyHint}</span>
    </div>
  );
};
