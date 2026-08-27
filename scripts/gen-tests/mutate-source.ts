export type Mutation = {
  name: string;
  apply: (source: string) => string | null;
};

export const MUTATIONS: Mutation[] = [
  {
    name: '===-to-!==',
    apply: (source) => (source.includes('===') ? source.replace('===', '!==') : null),
  },
  {
    name: '>-to->=',
    apply: (source) => (/\s>\s/.test(source) ? source.replace(/\s>\s/, ' >= ') : null),
  },
];

export const applyFirstMutation = (
  source: string,
  mutations: Mutation[] = MUTATIONS,
): { name: string; mutated: string } | null => {
  for (const mutation of mutations) {
    const mutated = mutation.apply(source);
    if (mutated && mutated !== source) return { name: mutation.name, mutated };
  }
  return null;
};

export const applyNamedMutation = (
  source: string,
  name: string,
  mutations: Mutation[] = MUTATIONS,
): string | null => {
  const mutation = mutations.find((item) => item.name === name);
  return mutation ? mutation.apply(source) : null;
};
