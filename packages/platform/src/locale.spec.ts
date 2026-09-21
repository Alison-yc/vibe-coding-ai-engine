import { DEFAULT_UI_LOCALE, UI_LOCALE_STORAGE_KEY } from '@ai-engine/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore } from './memory-kv';
import { readUiLocale, writeUiLocale } from './locale';

describe('平台界面语言', () => {
  it('缺失或非法存储值回退到中文', async () => {
    const kv = createMemoryKeyValueStore();
    await expect(readUiLocale(kv)).resolves.toBe(DEFAULT_UI_LOCALE);

    await kv.set(UI_LOCALE_STORAGE_KEY, 'fr-FR');
    await expect(readUiLocale(kv)).resolves.toBe(DEFAULT_UI_LOCALE);
  });

  it('持久化合法语言后才应用到平台', async () => {
    const kv = createMemoryKeyValueStore();
    const apply = vi.fn();

    await writeUiLocale(kv, 'ja-JP', apply);

    await expect(kv.get(UI_LOCALE_STORAGE_KEY)).resolves.toBe('ja-JP');
    expect(apply).toHaveBeenCalledWith('ja-JP');
  });
});
