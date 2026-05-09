import { Request } from "koa";
import type { Segment, SegmentCondition, SegmentVisibility } from "@sentrodb/connector-node-types";
import { DatabaseHandler } from "../types/db";
import type { AfterHook, BaseContext, BeforeHook, FieldWriter, Operation, ResultArrayByOp, RowOf } from "../types/modelCustomizer";
import { slugify } from "../utils/helpers";
export declare class ModelCustomizer<T extends DBManagerSchema.TableName> {
    readonly table: T;
    constructor(table: T);
    private writers;
    replaceFieldWriting<K extends string>(field: K, handler: FieldWriter<T, K>): this;
    applyFieldWriters(payload: Record<string, unknown>, ctx: BaseContext<T, "CREATE" | "UPDATE">): Promise<Record<string, unknown>>;
    private before;
    private after;
    onBefore<O extends Operation>(op: O, handler: BeforeHook<T, O>): this;
    onAfter<O extends Operation>(op: O, hook: AfterHook<T, O>): this;
    runBefore<O extends Operation>(op: O, payload: any, ctx: BaseContext<T, O>): Promise<any>;
    runAfter<O extends Operation>(op: O, result: ResultArrayByOp<T, O>, ctx: BaseContext<T, O>): Promise<ResultArrayByOp<T, O>>;
    private customizationStore;
    /**
     * Rename the table/model
     * @param name - The new display name for the table
     * @returns this for method chaining
     */
    rename(name: string): this;
    /**
     * Rename a column
     * @param columnName - The column to rename
     * @param name - The new display name for the column
     * @returns this for method chaining
     */
    renameColumn<K extends keyof RowOf<T>>(columnName: K, name: string): this;
    /**
     * Add a display field with a callback function
     * @param name - The name of the display field
     * @param callback - Function that receives record data and returns the display value
     * @returns this for method chaining
     */
    addDisplayField(name: string, callback: (record: DBManagerSchema.RowBy<T>) => any): this;
    private actionRegistry;
    /**
     * Register a table action that operates on multiple records
     * @param id - The id of the action (no spaces or special characters)
     * @param label - The display label for the action
     * @param callback - Function that receives array of records and performs the action
     * @param options.segmentId - If set, action only appears in this segment
     * @returns this for method chaining
     */
    registerTableAction(id: string, label: string, callback: (request: Request, records: DBManagerSchema.RowBy<T>[], db: DatabaseHandler) => any, options?: {
        segmentId?: string;
    }): this;
    /**
     * Register a detail/record action that operates on a single record
     * @param id - The id of the action (no spaces or special characters)
     * @param label - The display label for the action
     * @param callback - Function that receives a single record and performs the action
     * @param options.segmentId - If set, action only appears in this segment
     * @returns this for method chaining
     */
    registerDetailAction(id: string, label: string, callback: (request: Request, record: DBManagerSchema.RowBy<T>, db: DatabaseHandler) => any, options?: {
        segmentId?: string;
    }): this;
    addAction({ type, id, label, callback, segmentId }: {
        type: "table" | "detail";
        id: string;
        label: string;
        callback: (request: Request, records: DBManagerSchema.RowBy<T> | DBManagerSchema.RowBy<T>[], db: DatabaseHandler) => any;
        segmentId?: string;
    }): this;
    /**
     * Create a new segment for this table.
     * @param input.name - Display name (required)
     * @param input.conditions - AND-merged WHERE conditions (defaults to [])
     * @param input.visibility - "visible" | "hidden" (defaults to "visible")
     * @param input.slug - Optional explicit slug; auto-generated from name if omitted
     * @returns the created Segment
     */
    createSegment(input: {
        name: string;
        conditions?: SegmentCondition[];
        visibility?: SegmentVisibility;
        slug?: string;
    }): Segment;
    /**
     * Update a segment by slug. Slug itself can be changed via `patch.slug`
     * (will be re-slugified and de-duplicated against other segments).
     */
    updateSegment(slug: string, patch: Partial<Omit<Segment, "id">>): Segment | null;
    deleteSegment(slug: string): boolean;
    /** Reorder segments by providing the desired slug order. Unknown slugs are ignored. */
    reorderSegments(slugs: string[]): Segment[];
    getSegment(slug: string): Segment | undefined;
    listSegments(): Segment[];
}
export { slugify };
//# sourceMappingURL=modelCustomizer.d.ts.map