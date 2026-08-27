import { Check, ChevronDown } from 'lucide-react';
import {
  Children,
  type ChangeEvent,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '../../lib/utils';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

const optionText = (children: ReactNode): string =>
  Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      if (!isValidElement<{ children?: ReactNode }>(child)) return '';
      return optionText(child.props.children);
    })
    .join('');

const readOptions = (children: ReactNode): SelectOption[] =>
  Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child) || child.type !== 'option') return [];
    const element = child as ReactElement<OptionHTMLAttributes<HTMLOptionElement>>;
    const value = element.props.value == null ? '' : String(element.props.value);
    const label = optionText(element.props.children) || value;
    return [{ value, label, disabled: Boolean(element.props.disabled) }];
  });

const emitChange = (onChange: SelectProps['onChange'], value: string): void => {
  if (!onChange) return;
  const target = { value } as HTMLSelectElement;
  onChange({
    target,
    currentTarget: target,
  } as ChangeEvent<HTMLSelectElement>);
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    { className, children, value, defaultValue, disabled, id, name, onChange, onBlur, ...props },
    ref,
  ) => {
    const listId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const hiddenRef = useRef<HTMLSelectElement | null>(null);
    const options = useMemo(() => readOptions(children), [children]);
    const isControlled = value !== undefined;
    const [open, setOpen] = useState(false);
    const [uncontrolled, setUncontrolled] = useState(() =>
      defaultValue == null ? (options[0]?.value ?? '') : String(defaultValue),
    );
    const selectedValue = String(isControlled ? value : uncontrolled);
    const selected = options.find((option) => option.value === selectedValue) ?? options[0];

    useEffect(() => {
      if (!open) return;
      const onPointerDown = (event: MouseEvent) => {
        if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setOpen(false);
      };
      document.addEventListener('mousedown', onPointerDown);
      document.addEventListener('keydown', onKeyDown);
      return () => {
        document.removeEventListener('mousedown', onPointerDown);
        document.removeEventListener('keydown', onKeyDown);
      };
    }, [open]);

    const setRefs = (node: HTMLSelectElement | null) => {
      hiddenRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    };

    const choose = (next: string) => {
      if (!isControlled) setUncontrolled(next);
      emitChange(onChange, next);
      setOpen(false);
    };

    return (
      <div ref={rootRef} className={cn('relative w-full', className)}>
        <select
          ref={setRefs}
          id={id}
          name={name}
          disabled={disabled}
          value={selectedValue}
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(event) => {
            if (!isControlled) setUncontrolled(event.target.value);
            onChange?.(event);
          }}
          onBlur={onBlur}
          {...props}
        >
          {children}
        </select>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          className={cn(
            'border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 py-1 text-left text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          )}
          onClick={() => setOpen((current) => !current)}
          onBlur={onBlur as never}
        >
          <span className="truncate">{selected?.label ?? '请选择'}</span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0 opacity-70" />
        </button>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="border-border bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 max-h-60 w-full min-w-[8rem] overflow-auto rounded-md border p-1 shadow-md"
          >
            {options.map((option) => {
              const active = option.value === selectedValue;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={option.disabled}
                    className={cn(
                      'hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50',
                      active && 'bg-accent/60',
                    )}
                    onClick={() => choose(option.value)}
                  >
                    <Check
                      className={cn('size-4 shrink-0', active ? 'opacity-100' : 'opacity-0')}
                    />
                    <span className="truncate">{option.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );
  },
);
Select.displayName = 'Select';
