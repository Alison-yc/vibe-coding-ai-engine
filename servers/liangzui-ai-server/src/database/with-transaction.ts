import type { AppDatabase } from './pg-vector-store';

class TransactionRollback extends Error {
  constructor() {
    super('withTransaction rollback');
    this.name = 'TransactionRollback';
  }
}

export const withTransaction = async <T>(
  db: AppDatabase,
  run: (tx: AppDatabase) => Promise<T>,
): Promise<T> => {
  let result: T | undefined;
  try {
    await db.transaction(async (tx) => {
      result = await run(tx);
      throw new TransactionRollback();
    });
  } catch (error) {
    if (error instanceof TransactionRollback) {
      if (result === undefined) throw new Error('withTransaction 没有得到结果');
      return result;
    }
    throw error;
  }
  throw new Error('withTransaction 未回滚');
};
