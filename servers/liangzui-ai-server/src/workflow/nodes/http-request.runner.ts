import {
  HttpRequestNodeConfigSchema,
  type HttpRequestNodeConfig,
  type NodeRunResult,
  type ValueSelector,
} from '@ai-engine/contracts';
import type { NodeRunContext, NodeRunner, VariablePoolReader } from '../engine/types';
import { safeHttpRequest, type SafeHttpOptions } from '../security/safe-http';
import { templateSelectors } from './template-selectors';

type HttpRunnerDependencies = Pick<SafeHttpOptions, 'resolve' | 'requestImpl'>;

export class HttpRequestNodeRunner implements NodeRunner<HttpRequestNodeConfig> {
  readonly type = 'http-request' as const;
  readonly configSchema = HttpRequestNodeConfigSchema;

  constructor(private readonly dependencies: HttpRunnerDependencies = {}) {}

  getValueSelectors(config: HttpRequestNodeConfig): ValueSelector[] {
    return [
      ...templateSelectors(config.url),
      ...templateSelectors(config.body ?? ''),
      ...Object.values(config.headers).flatMap(templateSelectors),
    ];
  }

  async run(
    config: HttpRequestNodeConfig,
    pool: VariablePoolReader,
    context: NodeRunContext,
  ): Promise<NodeRunResult> {
    const headers = Object.fromEntries(
      Object.entries(config.headers).map(([name, value]) => [name, pool.render(value)]),
    );
    const result = await safeHttpRequest({
      method: config.method,
      url: pool.render(config.url),
      headers,
      // nosemgrep: javascript.express.security.audit.res-render-injection.res-render-injection -- VariablePool.render 只做内存字符串插值，不调用 Express response.render 或文件系统。
      body: config.body ? pool.render(config.body) : undefined,
      signal: context.signal,
      resolve: this.dependencies.resolve,
      requestImpl: this.dependencies.requestImpl,
    });
    return { outputs: result };
  }
}
