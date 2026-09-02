import {
  ObservabilityMetricsResponseSchema,
  type ObservabilityMetricsResponse,
} from '@ai-engine/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@ai-engine/ui';
import { useCallback, useState } from 'react';
import { usePlatform, type Platform } from '@ai-engine/platform';

export const formatMs = (value: number | null | undefined): string =>
  value == null ? '—' : `${Math.round(value)} ms`;

export const ObservabilityMetricsPanel = ({
  metrics,
}: {
  metrics: ObservabilityMetricsResponse;
}) => (
  <>
    <section className="grid gap-3 sm:grid-cols-3">
      <MetricCard label="调用次数" value={String(metrics.summary.totalCalls)} />
      <MetricCard label="平均耗时" value={`${Math.round(metrics.summary.averageTotalMs)} ms`} />
      <MetricCard label="接近上下文上限" value={String(metrics.summary.contextUsageBuckets.high)} />
    </section>

    <section className="flex flex-col gap-2">
      <h2 className="text-base">finishReason 分布</h2>
      <div className="flex flex-wrap gap-2">
        {Object.entries(metrics.summary.finishReasonCounts).map(([reason, count]) => (
          <Badge key={reason} variant="secondary">
            {reason}: {count}
          </Badge>
        ))}
      </div>
    </section>

    <section className="flex flex-col gap-2">
      <h2 className="text-base">阶段平均耗时</h2>
      <div className="flex flex-wrap gap-2">
        {Object.entries(metrics.summary.operationAverageMs).map(([operation, averageMs]) => (
          <Badge key={operation} variant="outline">
            {operation}: {Math.round(averageMs)} ms
          </Badge>
        ))}
      </div>
    </section>

    <section className="flex flex-col gap-2">
      <h2 className="text-base">最近调用</h2>
      <div className="overflow-auto rounded-md border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2">时间</th>
              <th className="px-3 py-2">traceId</th>
              <th className="px-3 py-2">操作</th>
              <th className="px-3 py-2">模型</th>
              <th className="px-3 py-2">prompt</th>
              <th className="px-3 py-2">completion</th>
              <th className="px-3 py-2">首 token</th>
              <th className="px-3 py-2">总耗时</th>
              <th className="px-3 py-2">finishReason</th>
            </tr>
          </thead>
          <tbody>
            {metrics.calls.map((call) => (
              <tr key={call.id} className="border-t">
                <td className="px-3 py-2">{new Date(call.recordedAt).toLocaleTimeString()}</td>
                <td className="px-3 py-2 font-mono">{call.traceId.slice(0, 8)}</td>
                <td className="px-3 py-2">{call.operation}</td>
                <td className="px-3 py-2">{call.model}</td>
                <td className="px-3 py-2">{call.promptTokens}</td>
                <td className="px-3 py-2">{call.completionTokens}</td>
                <td className="px-3 py-2">{formatMs(call.firstTokenMs)}</td>
                <td className="px-3 py-2">{formatMs(call.totalMs)}</td>
                <td className="px-3 py-2">{call.finishReason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  </>
);

export const toLoadErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '加载失败';

export const fetchObservabilityMetrics = async (
  platform: Platform,
): Promise<ObservabilityMetricsResponse> => {
  const baseUrl = platform.getApiBaseUrl().replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/dev/observability/metrics`);
  const data: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`加载失败: ${response.status}`);
  }
  return ObservabilityMetricsResponseSchema.parse(data);
};

export const ObservabilityPage = () => {
  const platform = usePlatform();
  const [metrics, setMetrics] = useState<ObservabilityMetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMetrics(await fetchObservabilityMetrics(platform));
    } catch (loadError) {
      setError(toLoadErrorMessage(loadError));
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [platform]);

  if (!platform.capabilities.devTools) {
    return (
      <main className="bg-background text-foreground p-6">
        <h1 className="text-lg">可观测性面板</h1>
        <p className="text-muted-foreground text-sm">仅开发环境可用。</p>
      </main>
    );
  }

  return (
    <main className="bg-background text-foreground flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg">可观测性</h1>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void loadMetrics()}
          >
            {metrics ? '刷新' : '加载指标'}
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          最近 50 次 LLM 调用指标。finishReason=length 通常表示输出被 numPredict 截断。
        </p>
      </header>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {!metrics && !loading && !error ? (
        <p className="text-muted-foreground text-sm">点击「加载指标」拉取最近 50 次 LLM 调用。</p>
      ) : null}

      {metrics ? <ObservabilityMetricsPanel metrics={metrics} /> : null}
    </main>
  );
};

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-muted-foreground text-xs font-normal">{label}</CardTitle>
    </CardHeader>
    <CardContent className="pt-0">
      <p className="text-lg font-semibold">{value}</p>
    </CardContent>
  </Card>
);
