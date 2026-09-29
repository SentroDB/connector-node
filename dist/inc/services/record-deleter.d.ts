import type { DatabaseHandler } from "../types/db";
import { GuardTable } from "../utils/write-guards";
/**
 * Delete records strictly by primary key, one statement per record.
 *
 * Every statement is `pk1 = ? AND pk2 = ? ...`, so it can only ever remove the
 * single row the key identifies. Validation happens for the whole batch before
 * the first statement runs.
 */
export declare function deleteRecordsByPrimaryKey(db: Pick<DatabaseHandler, "delete">, table: GuardTable, records: unknown): Promise<number>;
//# sourceMappingURL=record-deleter.d.ts.map