import type { NodeType } from '@ai-engine/contracts';
import type { NodeRunner } from '../engine/types';

export class NodeRegistry {
  private readonly runners = new Map<NodeType, NodeRunner>();

  constructor(runners: NodeRunner[] = []) {
    for (const runner of runners) this.register(runner);
  }

  register(runner: NodeRunner): void {
    if (this.runners.has(runner.type)) {
      throw new Error(`节点类型已注册：${runner.type}`);
    }
    this.runners.set(runner.type, runner);
  }

  get(type: NodeType): NodeRunner {
    const runner = this.runners.get(type);
    if (!runner) throw new Error(`节点类型未注册：${type}`);
    return runner;
  }

  list(): NodeRunner[] {
    return [...this.runners.values()];
  }
}
