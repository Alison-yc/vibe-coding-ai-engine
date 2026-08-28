import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FileInput,
  Input,
  Label,
  Textarea,
  ThemeToggle,
} from '@ai-engine/ui';
import { useTheme } from '../theme-provider';
import { ZH_CN_THEME_TOGGLE_LABELS } from '../components/theme-toggle-labels';

const SWATCHES = [
  { name: 'background', className: 'bg-background' },
  { name: 'card', className: 'bg-card' },
  { name: 'popover', className: 'bg-popover' },
  { name: 'muted', className: 'bg-muted' },
  { name: 'accent', className: 'bg-accent' },
  { name: 'primary', className: 'bg-primary' },
  { name: 'secondary', className: 'bg-secondary' },
  { name: 'destructive', className: 'bg-destructive' },
  { name: 'border', className: 'bg-border' },
  { name: 'input', className: 'bg-input' },
  { name: 'ring', className: 'bg-ring' },
  { name: 'chart-1', className: 'bg-chart-1' },
  { name: 'chart-2', className: 'bg-chart-2' },
  { name: 'chart-3', className: 'bg-chart-3' },
  { name: 'chart-4', className: 'bg-chart-4' },
  { name: 'chart-5', className: 'bg-chart-5' },
  { name: 'node-idle', className: 'bg-node-idle' },
  { name: 'node-running', className: 'bg-node-running' },
  { name: 'node-success', className: 'bg-node-success' },
  { name: 'node-error', className: 'bg-node-error' },
  { name: 'tool-pending', className: 'bg-tool-pending' },
  { name: 'tool-running', className: 'bg-tool-running' },
  { name: 'tool-success', className: 'bg-tool-success' },
  { name: 'tool-error', className: 'bg-tool-error' },
  { name: 'code-bg', className: 'bg-code-bg' },
  { name: 'citation-bg', className: 'bg-citation-bg' },
] as const;

export const TokenGalleryPage = () => {
  const { preference, setPreference } = useTheme();

  return (
    <main className="bg-background text-foreground flex flex-col gap-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg">设计令牌</h1>
        <p className="text-muted-foreground text-sm">
          八种主题组合下查看当前语义色与 Button。业务页面只应使用这些令牌 class。
        </p>
      </header>

      <ThemeToggle
        preference={preference}
        onPreferenceChange={setPreference}
        labels={ZH_CN_THEME_TOGGLE_LABELS}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-base">语义色</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map((swatch) => (
            <div key={swatch.name} className="flex flex-col gap-2">
              <div
                className={`border-border h-12 rounded-md border ${swatch.className}`}
                data-token={swatch.name}
              />
              <span className="text-muted-foreground text-xs">{swatch.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base">输入</h2>
        <div className="grid max-w-md gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="token-input">单行输入</Label>
            <Input id="token-input" readOnly value="单行 Input" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="token-textarea">多行输入</Label>
            <Textarea id="token-textarea" readOnly value="多行输入使用语义令牌，不写硬编码色值。" />
          </div>
          <FileInput buttonLabel="上传示例" emptyHint="未选择文件" disabled />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base">卡片与徽章</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card</CardTitle>
              <CardDescription>边框 + shadow-sm，用于分区内容。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge>默认</Badge>
              <Badge variant="secondary">次要</Badge>
              <Badge variant="outline">描边</Badge>
              <Badge variant="success">成功</Badge>
              <Badge variant="warning">进行中</Badge>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base">Button</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button">默认</Button>
          <Button type="button" variant="secondary">
            次要
          </Button>
          <Button type="button" variant="outline">
            描边
          </Button>
          <Button type="button" variant="ghost">
            幽灵
          </Button>
          <Button type="button" variant="destructive">
            危险
          </Button>
        </div>
      </section>
    </main>
  );
};
