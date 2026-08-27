// @vitest-environment jsdom
import { act, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Select } from './components/ui/select';

let container: HTMLDivElement;
let root: Root;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (element: ReactNode): void => {
  act(() => root.render(element));
};

const button = (): HTMLButtonElement => {
  const element = container.querySelector('button');
  if (!(element instanceof HTMLButtonElement)) throw new Error('missing button');
  return element;
};

describe('Select', () => {
  it('受控模式从 listbox 选择并回传原生 change 形状', () => {
    const onChange = vi.fn();
    render(
      <Select value="a" onChange={onChange}>
        <option value="a">甲</option>
        <option value="b">乙</option>
      </Select>,
    );
    act(() => button().click());
    const option = container.querySelector('[role="option"][aria-selected="false"]');
    if (!(option instanceof HTMLButtonElement)) throw new Error('missing option');
    act(() => option.click());
    expect(onChange.mock.calls[0]?.[0].target.value).toBe('b');
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('非受控模式更新显示值并响应 Escape 与外部点击', () => {
    render(
      <Select defaultValue="b">
        <option value="a">甲</option>
        <option value="b">乙</option>
      </Select>,
    );
    act(() => button().click());
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    act(() => button().click());
    act(() => button().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    act(() => button().click());
    const option = [...container.querySelectorAll('[role="option"]')].find(
      (item) => item.textContent === '甲',
    );
    if (!(option instanceof HTMLButtonElement)) throw new Error('missing option');
    act(() => option.click());
    expect(button().textContent).toContain('甲');
  });

  it('保留隐藏 select、ref、blur、禁用选项和复合标签', () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select ref={ref} onChange={onChange} onBlur={onBlur}>
        文本
        <option value="a">
          {'甲'}
          {'一'}
        </option>
        <option value="b" disabled>
          乙
        </option>
      </Select>,
    );
    expect(button().textContent).toContain('甲一');
    expect(ref.current).toBe(container.querySelector('select'));
    const hidden = container.querySelector('select');
    if (!(hidden instanceof HTMLSelectElement)) throw new Error('missing hidden select');
    hidden.value = 'b';
    act(() => hidden.dispatchEvent(new Event('change', { bubbles: true })));
    expect(onChange).toHaveBeenCalledOnce();
    act(() => button().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(onBlur).toHaveBeenCalled();
    act(() => button().click());
    const disabled = container.querySelector('[role="option"][disabled]');
    expect(disabled).not.toBeNull();
  });

  it('无选项时显示占位且支持函数 ref 与无 onChange 选择', () => {
    const callbackRef = vi.fn();
    render(<Select ref={callbackRef}>忽略文本</Select>);
    expect(button().textContent).toContain('请选择');
    expect(callbackRef).toHaveBeenCalledWith(expect.any(HTMLSelectElement));
    render(
      <Select>
        <option>默认项</option>
      </Select>,
    );
    act(() => button().click());
    const option = container.querySelector('[role="option"]');
    if (!(option instanceof HTMLButtonElement)) throw new Error('missing option');
    act(() => option.click());
    expect(button().textContent).toContain('默认项');
  });
});
