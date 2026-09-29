"use strict";
/**
 * Pure request guards for the dynamic table routes. They only look at the
 * schema metadata, so they can be unit-tested without a database.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_DELETE_RECORDS = exports.RequestValidationError = void 0;
exports.getPrimaryKeyColumns = getPrimaryKeyColumns;
exports.getPhysicalColumnNames = getPhysicalColumnNames;
exports.assertKnownColumns = assertKnownColumns;
exports.buildPrimaryKeyWheres = buildPrimaryKeyWheres;
exports.assertValidWhere = assertValidWhere;
exports.assertValidConditions = assertValidConditions;
/** Thrown for requests the client got wrong. Routes turn it into a 400. */
class RequestValidationError extends Error {
    constructor(message) {
        super(message);
        this.status = 400;
        this.name = "RequestValidationError";
    }
}
exports.RequestValidationError = RequestValidationError;
exports.MAX_DELETE_RECORDS = 500;
const isPlainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const isKeyValue = (value) => (typeof value === "string" && value.length > 0) ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "bigint" ||
    typeof value === "boolean";
function getPrimaryKeyColumns(table) {
    return table.columns.filter((c) => c.primary_key && !c.isMany).map((c) => c.name);
}
/** Columns that exist as real SQL columns on the table. */
function getPhysicalColumnNames(table) {
    return new Set(table.columns.filter((c) => !c.isMany).map((c) => c.name));
}
/**
 * Reject any name that is not a column of the table. `allowed` decides which
 * columns count (e.g. M2M synthetic columns are valid in a write payload but
 * not in a where clause).
 */
function assertKnownColumns(table, names, context, allowed = new Set(table.columns.map((c) => c.name))) {
    for (const name of names) {
        if (typeof name !== "string" || !allowed.has(name)) {
            throw new RequestValidationError(`Unknown column "${String(name)}" in ${context} for table "${table.name}".`);
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
function buildPrimaryKeyWheres(table, records) {
    if (!Array.isArray(records) || records.length === 0) {
        throw new RequestValidationError("No records provided");
    }
    if (records.length > exports.MAX_DELETE_RECORDS) {
        throw new RequestValidationError(`Too many records: at most ${exports.MAX_DELETE_RECORDS} can be deleted per request.`);
    }
    const primaryKeys = getPrimaryKeyColumns(table);
    if (!primaryKeys.length) {
        throw new RequestValidationError(`Table "${table.name}" has no primary key, so its records cannot be deleted through this endpoint.`);
    }
    const seen = new Set();
    const wheres = [];
    records.forEach((record, index) => {
        if (!isPlainObject(record)) {
            throw new RequestValidationError(`Record at index ${index} is not an object.`);
        }
        const where = {};
        for (const column of primaryKeys) {
            const value = record[column];
            if (!isKeyValue(value)) {
                throw new RequestValidationError(`Record at index ${index} is missing a value for primary key column "${column}".`);
            }
            where[column] = value;
        }
        const identity = JSON.stringify(primaryKeys.map((column) => [typeof where[column], String(where[column])]));
        if (seen.has(identity))
            return;
        seen.add(identity);
        wheres.push(where);
    });
    return wheres;
}
/**
 * Validate an equality `where` object: non-empty, known physical columns,
 * scalar (or null) values only.
 */
function assertValidWhere(table, where, context, { required }) {
    if (where === undefined || where === null) {
        if (required) {
            throw new RequestValidationError(`Refusing to ${context} without a \`where\` clause — this would affect every row.`);
        }
        return;
    }
    if (!isPlainObject(where)) {
        throw new RequestValidationError(`\`where\` must be an object.`);
    }
    const keys = Object.keys(where);
    if (required && keys.length === 0) {
        throw new RequestValidationError(`Refusing to ${context} without a \`where\` clause — this would affect every row.`);
    }
    assertKnownColumns(table, keys, "where", getPhysicalColumnNames(table));
    for (const key of keys) {
        const value = where[key];
        if (value !== null && typeof value === "object") {
            throw new RequestValidationError(`Value for "${key}" in where must be a scalar.`);
        }
        if (value === undefined) {
            throw new RequestValidationError(`Value for "${key}" in where is missing.`);
        }
    }
}
/** Validate the `conditions` array of a read request. */
function assertValidConditions(table, conditions) {
    if (conditions === undefined || conditions === null)
        return;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JpdGUtZ3VhcmRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy91dGlscy93cml0ZS1ndWFyZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBa0NILG9EQUVDO0FBR0Qsd0RBRUM7QUFPRCxnREFhQztBQWFELHNEQWdEQztBQU1ELDRDQW1DQztBQUdELHNEQVlDO0FBcktELDJFQUEyRTtBQUMzRSxNQUFhLHNCQUF1QixTQUFRLEtBQUs7SUFHL0MsWUFBWSxPQUFlO1FBQ3pCLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUhELFdBQU0sR0FBRyxHQUFHLENBQUM7UUFJM0IsSUFBSSxDQUFDLElBQUksR0FBRyx3QkFBd0IsQ0FBQztJQUN2QyxDQUFDO0NBQ0Y7QUFQRCx3REFPQztBQUVZLFFBQUEsa0JBQWtCLEdBQUcsR0FBRyxDQUFDO0FBRXRDLE1BQU0sYUFBYSxHQUFHLENBQUMsS0FBYyxFQUFvQyxFQUFFLENBQ3pFLENBQUMsQ0FBQyxLQUFLLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUVoRSxNQUFNLFVBQVUsR0FBRyxDQUFDLEtBQWMsRUFBK0MsRUFBRSxDQUNqRixDQUFDLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUMvQyxDQUFDLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3JELE9BQU8sS0FBSyxLQUFLLFFBQVE7SUFDekIsT0FBTyxLQUFLLEtBQUssU0FBUyxDQUFDO0FBRTdCLFNBQWdCLG9CQUFvQixDQUFDLEtBQWlCO0lBQ3BELE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEYsQ0FBQztBQUVELDJEQUEyRDtBQUMzRCxTQUFnQixzQkFBc0IsQ0FBQyxLQUFpQjtJQUN0RCxPQUFPLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQzVFLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsU0FBZ0Isa0JBQWtCLENBQ2hDLEtBQWlCLEVBQ2pCLEtBQXdCLEVBQ3hCLE9BQWUsRUFDZixVQUF1QixJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBRWhFLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFLENBQUM7UUFDekIsSUFBSSxPQUFPLElBQUksS0FBSyxRQUFRLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDbkQsTUFBTSxJQUFJLHNCQUFzQixDQUM5QixtQkFBbUIsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLE9BQU8sZUFBZSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQzVFLENBQUM7UUFDSixDQUFDO0lBQ0gsQ0FBQztBQUNILENBQUM7QUFFRDs7Ozs7Ozs7OztHQVVHO0FBQ0gsU0FBZ0IscUJBQXFCLENBQ25DLEtBQWlCLEVBQ2pCLE9BQWdCO0lBRWhCLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDcEQsTUFBTSxJQUFJLHNCQUFzQixDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUNELElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRywwQkFBa0IsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sSUFBSSxzQkFBc0IsQ0FDOUIsNkJBQTZCLDBCQUFrQiw4QkFBOEIsQ0FDOUUsQ0FBQztJQUNKLENBQUM7SUFFRCxNQUFNLFdBQVcsR0FBRyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUNoRCxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3hCLE1BQU0sSUFBSSxzQkFBc0IsQ0FDOUIsVUFBVSxLQUFLLENBQUMsSUFBSSwrRUFBK0UsQ0FDcEcsQ0FBQztJQUNKLENBQUM7SUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0lBQy9CLE1BQU0sTUFBTSxHQUE4RCxFQUFFLENBQUM7SUFFN0UsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUNoQyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDM0IsTUFBTSxJQUFJLHNCQUFzQixDQUFDLG1CQUFtQixLQUFLLG9CQUFvQixDQUFDLENBQUM7UUFDakYsQ0FBQztRQUVELE1BQU0sS0FBSyxHQUF1RCxFQUFFLENBQUM7UUFDckUsS0FBSyxNQUFNLE1BQU0sSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNqQyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDN0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN2QixNQUFNLElBQUksc0JBQXNCLENBQzlCLG1CQUFtQixLQUFLLCtDQUErQyxNQUFNLElBQUksQ0FDbEYsQ0FBQztZQUNKLENBQUM7WUFDRCxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUM3QixXQUFXLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDLE1BQU0sQ0FBQyxFQUFFLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQzNFLENBQUM7UUFDRixJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDO1lBQUUsT0FBTztRQUMvQixJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ25CLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDckIsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPLE1BQU0sQ0FBQztBQUNoQixDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsU0FBZ0IsZ0JBQWdCLENBQzlCLEtBQWlCLEVBQ2pCLEtBQWMsRUFDZCxPQUFlLEVBQ2YsRUFBRSxRQUFRLEVBQXlCO0lBRW5DLElBQUksS0FBSyxLQUFLLFNBQVMsSUFBSSxLQUFLLEtBQUssSUFBSSxFQUFFLENBQUM7UUFDMUMsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNiLE1BQU0sSUFBSSxzQkFBc0IsQ0FDOUIsZUFBZSxPQUFPLDREQUE0RCxDQUNuRixDQUFDO1FBQ0osQ0FBQztRQUNELE9BQU87SUFDVCxDQUFDO0lBQ0QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzFCLE1BQU0sSUFBSSxzQkFBc0IsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFDRCxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2hDLElBQUksUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDbEMsTUFBTSxJQUFJLHNCQUFzQixDQUM5QixlQUFlLE9BQU8sNERBQTRELENBQ25GLENBQUM7SUFDSixDQUFDO0lBQ0Qsa0JBQWtCLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUUsc0JBQXNCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUN4RSxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO1FBQ3ZCLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN6QixJQUFJLEtBQUssS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDaEQsTUFBTSxJQUFJLHNCQUFzQixDQUM5QixjQUFjLEdBQUcsOEJBQThCLENBQ2hELENBQUM7UUFDSixDQUFDO1FBQ0QsSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDeEIsTUFBTSxJQUFJLHNCQUFzQixDQUFDLGNBQWMsR0FBRyx3QkFBd0IsQ0FBQyxDQUFDO1FBQzlFLENBQUM7SUFDSCxDQUFDO0FBQ0gsQ0FBQztBQUVELHlEQUF5RDtBQUN6RCxTQUFnQixxQkFBcUIsQ0FBQyxLQUFpQixFQUFFLFVBQW1CO0lBQzFFLElBQUksVUFBVSxLQUFLLFNBQVMsSUFBSSxVQUFVLEtBQUssSUFBSTtRQUFFLE9BQU87SUFDNUQsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztRQUMvQixNQUFNLElBQUksc0JBQXNCLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztJQUNyRSxDQUFDO0lBQ0QsTUFBTSxRQUFRLEdBQUcsc0JBQXNCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDL0MsS0FBSyxNQUFNLFNBQVMsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDOUIsTUFBTSxJQUFJLHNCQUFzQixDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDeEUsQ0FBQztRQUNELGtCQUFrQixDQUFDLEtBQUssRUFBRSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDeEUsQ0FBQztBQUNILENBQUMifQ==