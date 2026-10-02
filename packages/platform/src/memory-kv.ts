import type { KeyValueStore, SecretStore } from './types';

export const createMemorySecretStore = (): SecretStore => createMemoryKeyValueStore();

export const createMemoryKeyValueStore = (): KeyValueStore => {
  const store = new Map<string, string>();
  return {
    get: (key) => Promise.resolve(store.get(key) ?? null),
    set: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      store.delete(key);
      return Promise.resolve();
    },
  };
};
