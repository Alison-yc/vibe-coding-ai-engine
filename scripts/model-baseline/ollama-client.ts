type OllamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_name?: string;
  tool_calls?: ToolCall[];
};

export type OllamaTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolCall = {
  function?: {
    name?: string;
    arguments?: unknown;
  };
};

export type OllamaChatResult = {
  content: string;
  toolCalls: ToolCall[];
  promptTokens: number;
  outputTokens: number;
  totalDurationMs: number;
  loadDurationMs: number;
};

export type OllamaStreamMetrics = {
  firstTokenMs: number;
  totalDurationMs: number;
  outputTokens: number;
  tokensPerSecond: number;
};

type ChatResponse = {
  message?: {
    content?: string;
    tool_calls?: ToolCall[];
  };
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
  load_duration?: number;
};

type EmbedResponse = {
  embeddings?: unknown;
};

type ShowResponse = {
  details?: {
    parameter_size?: string;
    quantization_level?: string;
  };
  model_info?: Record<string, unknown>;
};

type TagsResponse = {
  models?: Array<{ name?: string; digest?: string }>;
};

const toMilliseconds = (nanoseconds: number | undefined): number =>
  Math.round((nanoseconds ?? 0) / 1_000_000);

const readJson = async (response: Response): Promise<unknown> => {
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
};

export class BaselineOllamaClient {
  constructor(private readonly baseUrl: string) {}

  async chat(input: {
    model: string;
    messages: OllamaMessage[];
    tools?: OllamaTool[];
    format?: 'json' | object;
    numCtx?: number;
    numPredict?: number;
    keepAlive?: string | number;
  }): Promise<OllamaChatResult> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        stream: false,
        think: false,
        tools: input.tools,
        format: input.format,
        keep_alive: input.keepAlive ?? '10m',
        options: {
          temperature: 0,
          num_ctx: input.numCtx,
          num_predict: input.numPredict ?? 256,
        },
      }),
    });
    const body = (await readJson(response)) as ChatResponse;
    return {
      content: body.message?.content ?? '',
      toolCalls: body.message?.tool_calls ?? [],
      promptTokens: body.prompt_eval_count ?? 0,
      outputTokens: body.eval_count ?? 0,
      totalDurationMs: toMilliseconds(body.total_duration),
      loadDurationMs: toMilliseconds(body.load_duration),
    };
  }

  async embed(model: string, input: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input, keep_alive: '10m' }),
    });
    const body = (await readJson(response)) as EmbedResponse;
    if (
      !Array.isArray(body.embeddings) ||
      !body.embeddings.every(
        (vector) => Array.isArray(vector) && vector.every((value) => typeof value === 'number'),
      )
    ) {
      throw new Error('Ollama /api/embed 返回了无效的 embeddings');
    }
    return body.embeddings;
  }

  async streamProbe(input: {
    model: string;
    prompt: string;
    keepAlive: string | number;
  }): Promise<OllamaStreamMetrics> {
    const startedAt = performance.now();
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: 'user', content: input.prompt }],
        stream: true,
        think: false,
        keep_alive: input.keepAlive,
        options: { temperature: 0, num_predict: 128 },
      }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Ollama 流式请求失败：HTTP ${response.status}`);
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let firstTokenMs = 0;
    let outputTokens = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += chunk.value;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed: unknown = JSON.parse(line);
        if (typeof parsed !== 'object' || parsed === null) continue;
        if (
          firstTokenMs === 0 &&
          'message' in parsed &&
          typeof parsed.message === 'object' &&
          parsed.message !== null &&
          'content' in parsed.message &&
          typeof parsed.message.content === 'string' &&
          parsed.message.content.length > 0
        ) {
          firstTokenMs = Math.round(performance.now() - startedAt);
        }
        if ('eval_count' in parsed && typeof parsed.eval_count === 'number') {
          outputTokens = parsed.eval_count;
        }
      }
    }
    const totalDurationMs = Math.round(performance.now() - startedAt);
    return {
      firstTokenMs,
      totalDurationMs,
      outputTokens,
      tokensPerSecond:
        totalDurationMs > firstTokenMs
          ? Number((outputTokens / ((totalDurationMs - firstTokenMs) / 1000)).toFixed(2))
          : 0,
    };
  }

  async show(model: string): Promise<ShowResponse> {
    const response = await fetch(`${this.baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    return (await readJson(response)) as ShowResponse;
  }

  async digest(model: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    const body = (await readJson(response)) as TagsResponse;
    return body.models?.find((item) => item.name === model)?.digest?.slice(0, 12) ?? 'unknown';
  }

  async version(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/version`);
    const body = await readJson(response);
    if (
      typeof body !== 'object' ||
      body === null ||
      !('version' in body) ||
      typeof body.version !== 'string'
    ) {
      throw new Error('Ollama /api/version 返回格式无效');
    }
    return body.version;
  }
}
