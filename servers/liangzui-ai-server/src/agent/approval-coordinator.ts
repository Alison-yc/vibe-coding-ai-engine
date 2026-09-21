import { randomUUID } from 'node:crypto';
import {
  AgentApprovalSchema,
  type AgentApproval,
  type AgentStreamEvent,
  type AgentToolName,
  type PermissionDecision,
} from '@ai-engine/contracts';

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

type PendingApproval = {
  sessionId: string;
  settle: (decision: PermissionDecision) => void;
};

export class ApprovalCoordinator {
  private readonly pending = new Map<string, PendingApproval>();

  create(input: {
    sessionId: string;
    toolCallId: string;
    tool: AgentToolName;
    resource: string;
    diff?: string;
  }): AgentApproval {
    return AgentApprovalSchema.parse({
      id: randomUUID(),
      ...input,
      diff: input.diff ?? '',
    });
  }

  async wait(
    approval: AgentApproval,
    signal: AbortSignal,
    emit: (event: AgentStreamEvent) => void,
  ): Promise<PermissionDecision> {
    // 审批已持久化到消息；页面刷新不应把未决审批立即判为拒绝。
    void signal;
    return new Promise((resolve) => {
      const finish = (decision: PermissionDecision) => {
        clearTimeout(timer);
        this.pending.delete(approval.id);
        resolve(decision);
      };
      const timer = setTimeout(() => finish('deny'), APPROVAL_TIMEOUT_MS);
      this.pending.set(approval.id, { sessionId: approval.sessionId, settle: finish });
      emit({ event: 'permission.asked', data: approval });
    });
  }

  respond(sessionId: string, approvalId: string, decision: PermissionDecision): boolean {
    const approval = this.pending.get(approvalId);
    if (!approval || approval.sessionId !== sessionId) return false;
    approval.settle(decision);
    return true;
  }
}
