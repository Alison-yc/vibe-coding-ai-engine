import { describe, expect, it } from 'vitest';
import { VariablePool } from './variable-pool';

describe('VariablePool', () => {
  it('读取系统变量、节点变量和嵌套路径', () => {
    const pool = new VariablePool({ query: '你好', user: { id: 7 } });
    pool.set('node_a', { result: { text: '完成' } });
    expect(pool.getSystem('user.id')).toBe(7);
    expect(pool.get(['sys', 'query'])).toBe('你好');
    expect(pool.get(['node_a', 'result', 'text'])).toBe('完成');
    expect(pool.get(['missing', 'value'])).toBeUndefined();
  });

  it('渲染字符串、对象、空值与多个模板变量', () => {
    const pool = new VariablePool({ query: '问题' });
    pool.set('node_a', { count: 2, data: { ok: true }, empty: null });
    expect(
      pool.render(
        '{{#sys.query#}}/{{#node_a.count#}}/{{#node_a.data#}}/{{#node_a.empty#}}/{{#x.y#}}',
      ),
    ).toBe('问题/2/{"ok":true}//');
    expect(pool.snapshot()).toEqual({ node_a: { count: 2, data: { ok: true }, empty: null } });
  });

  it('写入和快照不会泄漏可变引用', () => {
    const output = { nested: { value: 1 } };
    const pool = new VariablePool({});
    pool.set('node', output);
    output.nested.value = 2;
    const snapshot = pool.snapshot();
    expect(snapshot).toEqual({ node: { nested: { value: 1 } } });
  });
});
