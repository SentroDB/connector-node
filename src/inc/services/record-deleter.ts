import type { DatabaseHandler } from "../types/db";
import { buildPrimaryKeyWheres, GuardTable } from "../utils/write-guards";

/**
 * Delete records strictly by primary key, one statement per record.
 *
 * Every statement is `pk1 = ? AND pk2 = ? ...`, so it can only ever remove the
 * single row the key identifies. Validation happens for the whole batch before
 * the first statement runs.
 */
export async function deleteRecordsByPrimaryKey(
  db: Pick<DatabaseHandler, "delete">,
  table: GuardTable,
  records: unknown,
): Promise<number> {
  const wheres = buildPrimaryKeyWheres(table, records);

  for (const where of wheres) {
    const scoped: Record<string, unknown[]> = {};
    for (const [column, value] of Object.entries(where)) {
      scoped[column] = [value];
    }
    await db.delete({
      table: table.name as DBManagerSchema.TableName,
      where: scoped as any,
      single: false,
    });
  }

  return wheres.length;
}
