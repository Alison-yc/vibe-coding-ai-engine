// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Profiler, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryKeyValueStore, PlatformProvider, type Platform } from '@ai-engine/platform';
import { NodeTypeSchema } from '@ai-engine/contracts';
import { NodeComponentMap, PanelComponentMap } from './nodes/registry';
import { NodeMetadataMap } from './nodes/metadata';
import { VariableSelector } from './variable-selector';
import { BlockSelector } from './canvas/block-selector';
import { ConfigPanel } from './canvas/config-panel';
import { RunInputDialog } from './canvas/run-input-dialog';
import { RunLogPanel } from './canvas/run-log-panel';
import { WorkflowCanvas } from './canvas/workflow-canvas';
import { NodeDebugPanel } from './canvas/node-debug-panel';
import { TemplateEditor } from './template-editor';
import { formatConfigValue } from './nodes/common';
import { flushConfigDrafts } from './nodes/use-config-draft';
import { loadWorkflowGraph, useWorkflowStore } from './store/workflow-store';
import type { CanvasNode } from './types';

vi.mock('./code-editor', () => ({
  CodeEditor: ({
    value,
    ariaLabel,
    onChange,
  }: {
    value: string;
    ariaLabel: string;
    onChange: Dispatch<SetStateAction<string>>;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 92,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 92,
      })),
    measureElement: () => undefined,
  }),
}));

const platform = {
  capabilities: {
    nativeDirectoryPicker: false,
    windowControls: false,
    routerMode: 'history',
    devTools: true,
  },
  pickDirectory: async () => null,
  pickFiles: async () => [],
  kv: createMemoryKeyValueStore(),
  getApiBaseUrl: () => 'http://localhost:3000',
  openExternal: async () => undefined,
  getAppInfo: async () => ({ name: 'test', version: '0' }),
  getSystemTheme: () => 'light',
  subscribeSystemTheme: () => () => undefined,
  window: {
    minimize: async () => undefined,
    maximize: async () => undefined,
    close: async () => undefined,
    reload: async () => undefined,
  },
} satisfies Platform;

const nodes: CanvasNode[] = [
  {
    id: 'start',
    type: 'custom-node',
    position: { x: 0, y: 0 },
    data: {
      type: 'start',
      title: '开始',
      config: NodeMetadataMap.start.defaultConfig,
    },
  },
  ...NodeTypeSchema.options
    .filter((type) => type !== 'start')
    .map((type, index) => {
      const metadata = NodeMetadataMap[type];
      return {
        id: `node_${index}`,
        type: 'custom-node' as const,
        position: { x: index * 10, y: 10 },
        data: {
          type,
          title: metadata.title,
          config: metadata.defaultConfig,
        },
      };
    }),
];
const target = nodes.find((node) => node.data.type === 'llm');
if (!target) throw new Error('测试 LLM 节点缺失');
const start = nodes.find((node) => node.data.type === 'start');
const end = nodes.find((node) => node.data.type === 'end');
const condition = nodes.find((node) => node.data.type === 'if-else');
if (!start || !end || !condition) throw new Error('测试关键节点缺失');
const edges = [{ id: 'edge', source: 'start', target: target.id }];

const renderWithProviders = (element: ReactNode) =>
  render(
    <PlatformProvider value={platform}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {element}
      </QueryClientProvider>
    </PlatformProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('工作流组件', () => {
  it('单一 CustomNode 画布挂载并通过注册表添加节点', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    loadWorkflowGraph({
      nodes: [start, end],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    render(<WorkflowCanvas />);
    fireEvent.click(screen.getByRole('button', { name: /HTTP 请求/ }));
    expect(screen.getAllByText('HTTP 请求', { exact: true }).length).toBeGreaterThan(1);
  });

  it('八类节点摘要与配置面板都能由注册表渲染', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json([])),
    );
    for (const node of nodes) {
      const Body = NodeComponentMap[node.data.type];
      const Panel = PanelComponentMap[node.data.type];
      const body = render(<Body data={node.data} />);
      expect(body.container.textContent).toContain(node.data.title);
      body.unmount();
      const invalidBody = render(<Body data={{ ...node.data, config: {} }} />);
      expect(invalidBody.container.textContent).not.toBe('');
      invalidBody.unmount();
      const panel = renderWithProviders(
        <Panel node={node} nodes={nodes} edges={edges} onChange={() => undefined} />,
      );
      expect(panel.container.textContent).not.toBe('');
      const buttons = panel.container.querySelectorAll('button');
      const lastButton = buttons.item(buttons.length - 1);
      if (lastButton && !lastButton.hasAttribute('disabled')) fireEvent.click(lastButton);
      panel.unmount();
    }
  });

  it('变量选择器标记失效引用并允许改选上游变量', () => {
    const onChange = vi.fn();
    render(
      <VariableSelector
        label="变量"
        nodeId={target.id}
        nodes={nodes}
        edges={edges}
        value={['deleted', 'text']}
        onChange={onChange}
      />,
    );
    expect(screen.getByText(/来源节点不存在/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'start\u0000query' } });
    expect(onChange).toHaveBeenCalledWith(['start', 'query']);
  });

  it('节点面板点击添加节点并限制开始、结束单例', () => {
    const onAdd = vi.fn();
    render(<BlockSelector nodes={nodes} onAdd={onAdd} />);
    expect(screen.getByRole('button', { name: /开始/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /结束/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /HTTP 请求/ }));
    expect(onAdd).toHaveBeenCalledWith('http-request');
  });

  it('条件面板支持把二元条件右值切换为变量引用', () => {
    const Panel = PanelComponentMap['if-else'];
    renderWithProviders(
      <Panel
        node={condition}
        nodes={nodes}
        edges={[{ id: 'condition-input', source: 'start', target: condition.id }]}
        onChange={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('分支 1 条件 1 运算符'), {
      target: { value: 'equals' },
    });
    fireEvent.change(screen.getByLabelText('分支 1 条件 1 右值来源'), {
      target: { value: 'selector' },
    });
    expect(screen.getByText('右值变量').textContent).toBe('右值变量');
    fireEvent.click(screen.getByRole('button', { name: '添加条件' }));
    expect(screen.getByLabelText('分支 1 条件关系')).toBeTruthy();
  });

  it('配置面板失焦保存标题并可关闭', () => {
    const onTitleChange = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <ConfigPanel
        node={target}
        nodes={nodes}
        edges={edges}
        onClose={onClose}
        onConfigChange={() => undefined}
        onTitleChange={onTitleChange}
        debugPanel={<span>调试区域</span>}
      />,
    );
    fireEvent.change(screen.getByDisplayValue('LLM'), { target: { value: '生成回答' } });
    fireEvent.blur(screen.getByDisplayValue('生成回答'));
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onTitleChange).toHaveBeenCalledWith('生成回答');
    expect(onClose).toHaveBeenCalled();
  });

  it('配置面板输入期间不触发画布重新渲染', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    loadWorkflowGraph({
      nodes: [start, target, end],
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    const onRender = vi.fn();
    renderWithProviders(
      <>
        <Profiler id="canvas" onRender={onRender}>
          <WorkflowCanvas />
        </Profiler>
        <ConfigPanel
          node={target}
          nodes={nodes}
          edges={edges}
          onClose={() => undefined}
          onConfigChange={(config) =>
            useWorkflowStore.getState().updateNodeConfig(target.id, config)
          }
          onTitleChange={() => undefined}
          debugPanel={<span />}
        />
      </>,
    );
    const renderCount = onRender.mock.calls.length;
    fireEvent.change(screen.getByLabelText('用户提示词'), {
      target: { value: '仍在面板本地编辑' },
    });
    expect(onRender).toHaveBeenCalledTimes(renderCount);
    flushConfigDrafts();
    expect(
      useWorkflowStore.getState().nodes.find((node) => node.id === target.id)?.data.config.prompt,
    ).toBe('仍在面板本地编辑');
  });

  it('运行输入表单转换数字、布尔和 JSON', () => {
    const onRun = vi.fn();
    render(
      <RunInputDialog
        fields={[
          { name: 'count', type: 'number', required: true },
          { name: 'enabled', type: 'boolean', required: true },
          { name: 'payload', type: 'object', required: true },
        ]}
        onClose={() => undefined}
        onRun={onRun}
      />,
    );
    fireEvent.change(screen.getByLabelText('count *'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('enabled *'), { target: { value: 'true' } });
    fireEvent.change(screen.getByLabelText('payload *'), { target: { value: '{"ok":true}' } });
    fireEvent.click(screen.getByRole('button', { name: '开始运行' }));
    expect(onRun).toHaveBeenCalledWith({ count: 3, enabled: true, payload: { ok: true } });
  });

  it('运行输入表单报告非法 JSON 并允许取消', () => {
    const onClose = vi.fn();
    render(
      <RunInputDialog
        fields={[{ name: 'payload', type: 'array', required: true }]}
        onClose={onClose}
        onRun={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('payload *'), { target: { value: '[' } });
    fireEvent.click(screen.getByRole('button', { name: '开始运行' }));
    expect(screen.getByText(/合法 JSON/).textContent).toContain('合法 JSON');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('模板编辑器可插入变量且配置值格式化覆盖复合类型', () => {
    const onChange = vi.fn();
    const view = render(
      <TemplateEditor
        label="提示词"
        value="问题："
        nodeId={target.id}
        nodes={nodes}
        edges={edges}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '插入变量' }));
    expect(onChange).toHaveBeenCalledWith('问题：{{#sys.query#}}');
    view.rerender(
      <TemplateEditor
        label="提示词"
        value="{{#sys.query#}} {{#missing.value#}}"
        nodeId={target.id}
        nodes={nodes}
        edges={edges}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('提示词变量高亮').textContent).toContain('{{#sys.query#}}');
    expect(screen.getByLabelText('提示词变量高亮').textContent).toContain('{{#missing.value#}}');
    expect(formatConfigValue(null)).toBe('');
    expect(formatConfigValue('文本')).toBe('文本');
    expect(formatConfigValue(1)).toBe('1');
    expect(formatConfigValue({ ok: true })).toBe('{"ok":true}');
  });

  it('虚拟日志面板展示流式文本、错误和输入输出', () => {
    render(
      <RunLogPanel
        open
        onToggle={() => undefined}
        logs={[
          {
            id: 'one',
            nodeId: 'llm',
            status: 'failed',
            title: 'LLM',
            text: '部分回答',
            error: '模型失败',
            inputs: { prompt: '问题' },
            outputs: { text: '回答' },
            elapsedMs: 10,
          },
        ]}
      />,
    );
    expect(screen.getByText('部分回答').textContent).toBe('部分回答');
    expect(screen.getByText('模型失败').textContent).toBe('模型失败');
    expect(screen.getByText(/输入/).textContent).toContain('问题');
    expect(screen.getByText(/输出/).textContent).toContain('回答');
  });

  it('折叠日志面板仍可触发展开', () => {
    const onToggle = vi.fn();
    render(<RunLogPanel open={false} onToggle={onToggle} logs={[]} />);
    fireEvent.click(screen.getByRole('button', { name: '展开' }));
    expect(onToggle).toHaveBeenCalled();
  });

  it('单节点调试校验输入并显示执行结果', async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: unknown, init?: { body?: string }) => {
        requestBody = JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
        return Response.json({ outputs: { text: '调试结果' } });
      }),
    );
    renderWithProviders(
      <NodeDebugPanel
        workflowId="11111111-1111-4111-8111-111111111111"
        nodeId={target.id}
        beforeRun={() => {
          useWorkflowStore.getState().updateNodeConfig(target.id, { prompt: '最新提示词' });
          return Promise.resolve();
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '运行当前节点' }));
    expect(await screen.findByText(/调试结果/)).toBeTruthy();
    expect(requestBody?.configOverride).toEqual({ prompt: '最新提示词' });
  });
});
