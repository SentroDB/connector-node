"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRecordsByPrimaryKey = deleteRecordsByPrimaryKey;
const write_guards_1 = require("../utils/write-guards");
/**
 * Delete records strictly by primary key, one statement per record.
 *
 * Every statement is `pk1 = ? AND pk2 = ? ...`, so it can only ever remove the
 * single row the key identifies. Validation happens for the whole batch before
 * the first statement runs.
 */
async function deleteRecordsByPrimaryKey(db, table, records) {
    const wheres = (0, write_guards_1.buildPrimaryKeyWheres)(table, records);
    for (const where of wheres) {
        const scoped = {};
        for (const [column, value] of Object.entries(where)) {
            scoped[column] = [value];
        }
        await db.delete({
            table: table.name,
            where: scoped,
            single: false,
        });
    }
    return wheres.length;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVjb3JkLWRlbGV0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3NlcnZpY2VzL3JlY29yZC1kZWxldGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBVUEsOERBb0JDO0FBN0JELHdEQUEwRTtBQUUxRTs7Ozs7O0dBTUc7QUFDSSxLQUFLLFVBQVUseUJBQXlCLENBQzdDLEVBQW1DLEVBQ25DLEtBQWlCLEVBQ2pCLE9BQWdCO0lBRWhCLE1BQU0sTUFBTSxHQUFHLElBQUEsb0NBQXFCLEVBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBRXJELEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFLENBQUM7UUFDM0IsTUFBTSxNQUFNLEdBQThCLEVBQUUsQ0FBQztRQUM3QyxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3BELE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNCLENBQUM7UUFDRCxNQUFNLEVBQUUsQ0FBQyxNQUFNLENBQUM7WUFDZCxLQUFLLEVBQUUsS0FBSyxDQUFDLElBQWlDO1lBQzlDLEtBQUssRUFBRSxNQUFhO1lBQ3BCLE1BQU0sRUFBRSxLQUFLO1NBQ2QsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FBQztBQUN2QixDQUFDIn0=