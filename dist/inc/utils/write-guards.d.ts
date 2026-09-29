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
export declare class RequestValidationError extends Error {
    readonly status = 400;
    constructor(message: string);
}
export declare const MAX_DELETE_RECORDS = 500;
export declare function getPrimaryKeyColumns(table: GuardTable): string[];
/** Columns that exist as real SQL columns on the table. */
export declare function getPhysicalColumnNames(table: GuardTable): Set<string>;
/**
 * Reject any name that is not a column of the table. `allowed` decides which
 * columns count (e.g. M2M synthetic columns are valid in a write payload but
 * not in a where clause).
 */
export declare function assertKnownColumns(table: GuardTable, names: Iterable<unknown>, context: string, allowed?: Set<string>): void;
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
export declare function buildPrimaryKeyWheres(table: GuardTable, records: unknown): Array<Record<string, string | number | bigint | boolean>>;
/**
 * Validate an equality `where` object: non-empty, known physical columns,
 * scalar (or null) values only.
 */
export declare function assertValidWhere(table: GuardTable, where: unknown, context: string, { required }: {
    required: boolean;
}): void;
/** Validate the `conditions` array of a read request. */
export declare function assertValidConditions(table: GuardTable, conditions: unknown): void;
//# sourceMappingURL=write-guards.d.ts.map