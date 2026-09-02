import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IndexingRunner } from './indexing.runner';
import { KNOWLEDGE_REPOSITORY, type KnowledgeRepository } from './knowledge.repository';

@Injectable()
export class IndexingScheduler {
  constructor(
    @Inject(KNOWLEDGE_REPOSITORY) private readonly repository: KnowledgeRepository,
    @Inject(IndexingRunner) private readonly indexing: IndexingRunner,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async drainPending(): Promise<void> {
    const pending = await this.repository.listPendingDocumentIds();
    for (const documentId of pending) {
      await this.indexing.run(documentId);
    }
  }
}
