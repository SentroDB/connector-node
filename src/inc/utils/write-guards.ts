/**
 * Pure request guards for the dynamic table routes. They only look at the
 * schema metadata, so they can be unit-tested without a database.
 */

export type GuardColumn = {
  name: string;
  primary_key?: boolean;
  isMany?: boolean;
};

export type GuardTable = {
  name: string;
  columns: GuardColumn[];
};

/** Thrown for requests the client got wrong. Routes turn it into a 400. */
export class RequestValidationError extends Error {
  public readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export const MAX_DELETE_RECORDS = 500;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isKeyValue = (value: unknown): value is string | number | bigint | boolean =>
  (typeof value === "string" && value.length > 0) ||
  (typeof value === "number" && Number.isFinite(value)) ||
  typeof value === "bigint" ||
  typeof value === "boolean";

export function getPrimaryKeyColumns(table: GuardTable): string[] {
  return table.columns.filter((c) => c.primary_key && !c.isMany).map((c) => c.name);
}

/** Columns that exist as real SQL columns on the table. */
export function getPhysicalColumnNames(table: GuardTable): Set<string> {
  return new Set(table.columns.filter((c) => !c.isMany).map((c) => c.name));
}

/**
 * Reject any name that is not a column of the table. `allowed` decides which
 * columns count (e.g. M2M synthetic columns are valid in a write payload but
 * not in a where clause).
 */
export function assertKnownColumns(
  table: GuardTable,
  names: Iterable<unknown>,
  context: string,
  allowed: Set<string> = new Set(table.columns.map((c) => c.name)),
): void {
  for (const name of names) {
    if (typeof name !== "string" || !allowed.has(name)) {
      throw new RequestValidationError(
        `Unknown column "${String(name)}" in ${context} for table "${table.name}".`,
      );
    }
  }
}

/**
 * Turn the body of a delete request into one primary-key `where` per record.
 *
 * - the table must have a primary key
 * - every record must carry every primary-key column with a scalar value
 * - nothing else in the record is used, so a delete can never be matched on
 *   arbitrary fields and can never hit more than the row the key identifies
 *
 * Throws before anything is executed, so a bad record in a batch means no
 * record of that batch is deleted.
 */
export function buildPrimaryKeyWheres(
  table: GuardTable,
  records: unknown,
): Array<Record<string, string | number | bigint | boolean>> {
  if (!Array.isArray(records) || records.length === 0) {
    throw new RequestValidationError("No records provided");
  }
  if (records.length > MAX_DELETE_RECORDS) {
    throw new RequestValidationError(
      `Too many records: at most ${MAX_DELETE_RECORDS} can be deleted per request.`,
    );
  }

  const primaryKeys = getPrimaryKeyColumns(table);
  if (!primaryKeys.length) {
    throw new RequestValidationError(
      `Table "${table.name}" has no primary key, so its records cannot be deleted through this endpoint.`,
    );
  }

  const seen = new Set<string>();
  const wheres: Array<Record<string, string | number | bigint | boolean>> = [];

  records.forEach((record, index) => {
    if (!isPlainObject(record)) {
      throw new RequestValidationError(`Record at index ${index} is not an object.`);
    }

    const where: Record<string, string | number | bigint | boolean> = {};
    for (const column of primaryKeys) {
      const value = record[column];
      if (!isKeyValue(value)) {
        throw new RequestValidationError(
          `Record at index ${index} is missing a value for primary key column "${column}".`,
        );
      }
      where[column] = value;
    }

    const identity = JSON.stringify(
      primaryKeys.map((column) => [typeof where[column], String(where[column])]),
    );
    if (seen.has(identity)) return;
    seen.add(identity);
    wheres.push(where);
  });

  return wheres;
}

/**
 * Validate an equality `where` object: non-empty, known physical columns,
 * scalar (or null) values only.
 */
export function assertValidWhere(
  table: GuardTable,
  where: unknown,
  context: string,
  { required }: { required: boolean },
): void {
  if (where === undefined || where === null) {
    if (required) {
      throw new RequestValidationError(
        `Refusing to ${context} without a \`where\` clause — this would affect every row.`,
      );
    }
    return;
  }
  if (!isPlainObject(where)) {
    throw new RequestValidationError(`\`where\` must be an object.`);
  }
  const keys = Object.keys(where);
  if (required && keys.length === 0) {
    throw new RequestValidationError(
      `Refusing to ${context} without a \`where\` clause — this would affect every row.`,
    );
  }
  assertKnownColumns(table, keys, "where", getPhysicalColumnNames(table));
  for (const key of keys) {
    const value = where[key];
    if (value !== null && typeof value === "object") {
      throw new RequestValidationError(
        `Value for "${key}" in where must be a scalar.`,
      );
    }
    if (value === undefined) {
      throw new RequestValidationError(`Value for "${key}" in where is missing.`);
    }
  }
}

/** Validate the `conditions` array of a read request. */
export function assertValidConditions(table: GuardTable, conditions: unknown): void {
  if (conditions === undefined || conditions === null) return;
  if (!Array.isArray(conditions)) {
    throw new RequestValidationError("`conditions` must be an array.");
  }
  const physical = getPhysicalColumnNames(table);
  for (const condition of conditions) {
    if (!isPlainObject(condition)) {
      throw new RequestValidationError("Each condition must be an object.");
    }
    assertKnownColumns(table, [condition.column], "conditions", physical);
  }
}
