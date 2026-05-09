export declare class ActionRegistry {
    private static _instance;
    private tableActions;
    private detailActions;
    private constructor();
    static get instance(): ActionRegistry;
    /**
     * Register a table action for a specific table (optionally scoped to a segment)
     */
    registerTableAction<T extends DBManagerSchema.TableName>(table: T, id: string, callback: (request: any, records: DBManagerSchema.RowBy<T>[], db: any) => any, segmentId?: string): void;
    /**
     * Register a detail action for a specific table (optionally scoped to a segment)
     */
    registerDetailAction<T extends DBManagerSchema.TableName>(table: T, id: string, callback: (request: any, record: DBManagerSchema.RowBy<T>, db: any) => any, segmentId?: string): void;
    /**
     * Get a table action callback. Looks up the segment-scoped action first, then
     * falls back to the table-base action of the same id.
     */
    getTableAction<T extends DBManagerSchema.TableName>(table: T, id: string, segmentId?: string): ((request: any, records: DBManagerSchema.RowBy<T>[], db: any) => any) | undefined;
    /**
     * Get a detail action callback. Looks up segment-scoped first, then base.
     */
    getDetailAction<T extends DBManagerSchema.TableName>(table: T, id: string, segmentId?: string): ((request: any, record: DBManagerSchema.RowBy<T>, db: any) => any) | undefined;
    /**
     * Get all registered table action ids visible in a given scope (segment + base).
     */
    getTableActionIds(table: string, segmentId?: string): string[];
    /**
     * Get all registered detail action ids visible in a given scope (segment + base).
     */
    getDetailActionIds(table: string, segmentId?: string): string[];
    private collectIds;
    /** Clear all actions for a specific table (across all segments). */
    clearTableActions(table: string): void;
    /** Clear actions for a specific segment of a table (preserves base actions). */
    clearSegmentActions(table: string, segmentId: string): void;
    /** Clear all actions */
    clearAll(): void;
}
//# sourceMappingURL=action-registry.d.ts.map