"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionRegistry = void 0;
const BASE_SCOPE = "__base__";
const scopeKey = (segmentId) => segmentId ?? BASE_SCOPE;
const composite = (table, segmentId, id) => `${table}::${scopeKey(segmentId)}::${id}`;
class ActionRegistry {
    constructor() {
        this.tableActions = new Map();
        this.detailActions = new Map();
    }
    static get instance() {
        if (!ActionRegistry._instance) {
            ActionRegistry._instance = new ActionRegistry();
        }
        return ActionRegistry._instance;
    }
    /**
     * Register a table action for a specific table (optionally scoped to a segment)
     */
    registerTableAction(table, id, callback, segmentId) {
        this.tableActions.set(composite(table, segmentId, id), callback);
    }
    /**
     * Register a detail action for a specific table (optionally scoped to a segment)
     */
    registerDetailAction(table, id, callback, segmentId) {
        this.detailActions.set(composite(table, segmentId, id), callback);
    }
    /**
     * Get a table action callback. Looks up the segment-scoped action first, then
     * falls back to the table-base action of the same id.
     */
    getTableAction(table, id, segmentId) {
        if (segmentId) {
            const scoped = this.tableActions.get(composite(table, segmentId, id));
            if (scoped)
                return scoped;
        }
        return this.tableActions.get(composite(table, undefined, id));
    }
    /**
     * Get a detail action callback. Looks up segment-scoped first, then base.
     */
    getDetailAction(table, id, segmentId) {
        if (segmentId) {
            const scoped = this.detailActions.get(composite(table, segmentId, id));
            if (scoped)
                return scoped;
        }
        return this.detailActions.get(composite(table, undefined, id));
    }
    /**
     * Get all registered table action ids visible in a given scope (segment + base).
     */
    getTableActionIds(table, segmentId) {
        return this.collectIds(this.tableActions, table, segmentId);
    }
    /**
     * Get all registered detail action ids visible in a given scope (segment + base).
     */
    getDetailActionIds(table, segmentId) {
        return this.collectIds(this.detailActions, table, segmentId);
    }
    collectIds(map, table, segmentId) {
        const tablePrefix = `${table}::`;
        const ids = new Set();
        for (const key of map.keys()) {
            if (!key.startsWith(tablePrefix))
                continue;
            const rest = key.slice(tablePrefix.length);
            const sepIdx = rest.indexOf("::");
            if (sepIdx === -1)
                continue;
            const scope = rest.slice(0, sepIdx);
            const id = rest.slice(sepIdx + 2);
            if (scope === BASE_SCOPE || (segmentId && scope === segmentId)) {
                ids.add(id);
            }
        }
        return [...ids];
    }
    /** Clear all actions for a specific table (across all segments). */
    clearTableActions(table) {
        const prefix = `${table}::`;
        for (const key of [...this.tableActions.keys()]) {
            if (key.startsWith(prefix))
                this.tableActions.delete(key);
        }
        for (const key of [...this.detailActions.keys()]) {
            if (key.startsWith(prefix))
                this.detailActions.delete(key);
        }
    }
    /** Clear actions for a specific segment of a table (preserves base actions). */
    clearSegmentActions(table, segmentId) {
        const prefix = `${table}::${segmentId}::`;
        for (const key of [...this.tableActions.keys()]) {
            if (key.startsWith(prefix))
                this.tableActions.delete(key);
        }
        for (const key of [...this.detailActions.keys()]) {
            if (key.startsWith(prefix))
                this.detailActions.delete(key);
        }
    }
    /** Clear all actions */
    clearAll() {
        this.tableActions.clear();
        this.detailActions.clear();
    }
}
exports.ActionRegistry = ActionRegistry;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aW9uLXJlZ2lzdHJ5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy9zZXJ2aWNlcy9hY3Rpb24tcmVnaXN0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBR0EsTUFBTSxVQUFVLEdBQUcsVUFBVSxDQUFDO0FBRTlCLE1BQU0sUUFBUSxHQUFHLENBQUMsU0FBa0IsRUFBRSxFQUFFLENBQUMsU0FBUyxJQUFJLFVBQVUsQ0FBQztBQUNqRSxNQUFNLFNBQVMsR0FBRyxDQUFDLEtBQWEsRUFBRSxTQUE2QixFQUFFLEVBQVUsRUFBRSxFQUFFLENBQzdFLEdBQUcsS0FBSyxLQUFLLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQztBQUU1QyxNQUFhLGNBQWM7SUFNekI7UUFIUSxpQkFBWSxHQUFHLElBQUksR0FBRyxFQUEwRSxDQUFDO1FBQ2pHLGtCQUFhLEdBQUcsSUFBSSxHQUFHLEVBQXVFLENBQUM7SUFFaEYsQ0FBQztJQUV4QixNQUFNLEtBQUssUUFBUTtRQUNqQixJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQzlCLGNBQWMsQ0FBQyxTQUFTLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUNsRCxDQUFDO1FBQ0QsT0FBTyxjQUFjLENBQUMsU0FBUyxDQUFDO0lBQ2xDLENBQUM7SUFFRDs7T0FFRztJQUNILG1CQUFtQixDQUNqQixLQUFRLEVBQ1IsRUFBVSxFQUNWLFFBQTZFLEVBQzdFLFNBQWtCO1FBRWxCLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRDs7T0FFRztJQUNILG9CQUFvQixDQUNsQixLQUFRLEVBQ1IsRUFBVSxFQUNWLFFBQTBFLEVBQzFFLFNBQWtCO1FBRWxCLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ3BFLENBQUM7SUFFRDs7O09BR0c7SUFDSCxjQUFjLENBQ1osS0FBUSxFQUNSLEVBQVUsRUFDVixTQUFrQjtRQUVsQixJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2QsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN0RSxJQUFJLE1BQU07Z0JBQUUsT0FBTyxNQUFNLENBQUM7UUFDNUIsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBRUQ7O09BRUc7SUFDSCxlQUFlLENBQ2IsS0FBUSxFQUNSLEVBQVUsRUFDVixTQUFrQjtRQUVsQixJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2QsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN2RSxJQUFJLE1BQU07Z0JBQUUsT0FBTyxNQUFNLENBQUM7UUFDNUIsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQ7O09BRUc7SUFDSCxpQkFBaUIsQ0FBQyxLQUFhLEVBQUUsU0FBa0I7UUFDakQsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsS0FBSyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFRDs7T0FFRztJQUNILGtCQUFrQixDQUFDLEtBQWEsRUFBRSxTQUFrQjtRQUNsRCxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGFBQWEsRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDL0QsQ0FBQztJQUVPLFVBQVUsQ0FBQyxHQUF5QixFQUFFLEtBQWEsRUFBRSxTQUFrQjtRQUM3RSxNQUFNLFdBQVcsR0FBRyxHQUFHLEtBQUssSUFBSSxDQUFDO1FBQ2pDLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFDOUIsS0FBSyxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUM7Z0JBQUUsU0FBUztZQUMzQyxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUMzQyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xDLElBQUksTUFBTSxLQUFLLENBQUMsQ0FBQztnQkFBRSxTQUFTO1lBQzVCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLElBQUksS0FBSyxLQUFLLFVBQVUsSUFBSSxDQUFDLFNBQVMsSUFBSSxLQUFLLEtBQUssU0FBUyxDQUFDLEVBQUUsQ0FBQztnQkFDL0QsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNkLENBQUM7UUFDSCxDQUFDO1FBQ0QsT0FBTyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUM7SUFDbEIsQ0FBQztJQUVELG9FQUFvRTtJQUNwRSxpQkFBaUIsQ0FBQyxLQUFhO1FBQzdCLE1BQU0sTUFBTSxHQUFHLEdBQUcsS0FBSyxJQUFJLENBQUM7UUFDNUIsS0FBSyxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDaEQsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQztnQkFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBQ0QsS0FBSyxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDakQsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQztnQkFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM3RCxDQUFDO0lBQ0gsQ0FBQztJQUVELGdGQUFnRjtJQUNoRixtQkFBbUIsQ0FBQyxLQUFhLEVBQUUsU0FBaUI7UUFDbEQsTUFBTSxNQUFNLEdBQUcsR0FBRyxLQUFLLEtBQUssU0FBUyxJQUFJLENBQUM7UUFDMUMsS0FBSyxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDaEQsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQztnQkFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBQ0QsS0FBSyxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDakQsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQztnQkFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUM3RCxDQUFDO0lBQ0gsQ0FBQztJQUVELHdCQUF3QjtJQUN4QixRQUFRO1FBQ04sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzdCLENBQUM7Q0FDRjtBQWhJRCx3Q0FnSUMifQ==