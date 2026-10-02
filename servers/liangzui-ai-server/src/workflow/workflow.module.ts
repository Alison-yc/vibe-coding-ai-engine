import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/ollama.config';
import { DatabaseModule } from '../database/database.module';
import { DRIZZLE } from '../database/database.providers';
import type { AppDatabase } from '../database/pg-vector-store';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { LLM_GATEWAY, type LlmGateway } from '../llm/llm-gateway';
import { ObservabilityModule } from '../observability/observability.module';
import { WorkflowEngine } from './engine/workflow-engine';
import { CodeNodeRunner } from './nodes/code.runner';
import { EndNodeRunner } from './nodes/end.runner';
import { HttpRequestNodeRunner } from './nodes/http-request.runner';
import { IfElseNodeRunner } from './nodes/if-else.runner';
import { KnowledgeRetrievalNodeRunner } from './nodes/knowledge-retrieval.runner';
import { LlmNodeRunner } from './nodes/llm.runner';
import { NodeRegistry } from './nodes/registry';
import { StartNodeRunner } from './nodes/start.runner';
import { VariableAssignerNodeRunner } from './nodes/variable-assigner.runner';
import { QuickJsSandbox } from './sandbox/quickjs-sandbox';
import { WorkflowController } from './workflow.controller';
import { createWorkflowRepository, WORKFLOW_REPOSITORY } from './workflow.repository';
import { WorkflowService } from './workflow.service';
import { NODE_REGISTRY, QUICKJS_SANDBOX, WORKFLOW_ENGINE } from './workflow.tokens';

@Module({
  imports: [DatabaseModule, ObservabilityModule, KnowledgeModule],
  controllers: [WorkflowController],
  providers: [
    {
      provide: WORKFLOW_REPOSITORY,
      inject: [DRIZZLE, ConfigService],
      useFactory: (db: AppDatabase | null, config: ConfigService<AppConfig, true>) =>
        createWorkflowRepository(db, config.get('NODE_ENV', { infer: true })),
    },
    { provide: QUICKJS_SANDBOX, useFactory: () => new QuickJsSandbox() },
    {
      provide: NODE_REGISTRY,
      inject: [LLM_GATEWAY, KnowledgeService, QUICKJS_SANDBOX],
      useFactory: (gateway: LlmGateway, knowledge: KnowledgeService, sandbox: QuickJsSandbox) =>
        new NodeRegistry([
          new StartNodeRunner(),
          new EndNodeRunner(),
          new VariableAssignerNodeRunner(),
          new IfElseNodeRunner(),
          new LlmNodeRunner(gateway),
          new KnowledgeRetrievalNodeRunner(knowledge),
          new HttpRequestNodeRunner(),
          new CodeNodeRunner(sandbox),
        ]),
    },
    {
      provide: WORKFLOW_ENGINE,
      inject: [NODE_REGISTRY],
      useFactory: (registry: NodeRegistry) => new WorkflowEngine(registry),
    },
    WorkflowService,
  ],
})
export class WorkflowModule {}
