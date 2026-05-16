import { Request } from "koa";
import type {
  Segment,
  SegmentCondition,
  SegmentVisibility,
} from "@sentrodb/connector-node-types";
import { CustomizationStore } from "../core/customizationStore";
import { ActionRegistry } from "../services/action-registry";
import { IntegrationRegistry } from "../services/integration-registry";
import { DatabaseHandler } from "../types/db";
import type {
  AfterHook,
  BaseContext,
  BeforeHook,
  FieldWriter,
  Operation,
  ResultArrayByOp,
  ColumnName,
} from "../types/modelCustomizer";
import { randomId, slugify, toArray, uniqueSlug } from "../utils/helpers";

export class ModelCustomizer<T extends DBManagerSchema.TableName> {
  constructor(public readonly table: T) { }

  private writers = new Map<string, FieldWriter<T, any>>();
  replaceFieldWriting<K extends ColumnName<T>>(field: K, handler: FieldWriter<T, K>) {
    this.writers.set(field, handler as FieldWriter<T, any>);
    return this;
  }

  async applyFieldWriters(
    payload: Record<string, unknown>,
    ctx: BaseContext<T, "CREATE" | "UPDATE">
  ): Promise<Record<string, unknown>> {
    if (!this.writers.size) return payload;
    const out = { ...payload };
    for (const [key, value] of Object.entries(payload)) {
      const writer = this.writers.get(key);
      if (!writer) continue;
      const patch = await writer(value, ctx);
      if (patch && typeof patch === "object") Object.assign(out, patch);
    }
    return out;
  }

  /* --------------------- Hooks ----------------------- */
  private before = new Map<Operation, Array<BeforeHook<T, Operation>>>();
  private after = new Map<Operation, Array<AfterHook<T, Operation>>>();

  onBefore<O extends Operation>(op: O, handler: BeforeHook<T, O>) {
    const arr = this.before.get(op) ?? [];
    arr.push(handler as any);
    this.before.set(op, arr);
    return this;
  }

  onAfter<O extends Operation>(op: O, hook: AfterHook<T, O>) {
    const list = this.after.get(op) ?? [];
    list.push(hook as AfterHook<T, Operation>);
    this.after.set(op, list);
    return this;
  }

  async runBefore<O extends Operation>(
    op: O,
    payload: any,
    ctx: BaseContext<T, O>
  ): Promise<any> {
    const handlers = this.before.get(op) ?? [];
    let current = payload;
    for (const h of handlers) {
      const next = await h(current, ctx);
      if (next !== undefined) current = next;
    }
    return current;
  }

  async runAfter<O extends Operation>(
    op: O,
    result: ResultArrayByOp<T, O>,
    ctx: BaseContext<T, O>
  ): Promise<ResultArrayByOp<T, O>> {
    const list = this.after.get(op) ?? [];
    let out = toArray(result) as ResultArrayByOp<T, O>;

    for (const h of list) {
      const maybe = await h(out, ctx);
      if (typeof maybe !== "undefined") {
        out = toArray(maybe) as ResultArrayByOp<T, O>;
      }
    }
    return out;
  }

  /* ----------------- Customization Methods ------------- */
  private customizationStore = CustomizationStore.instance;

  /**
   * Rename the table/model
   * @param name - The new display name for the table
   * @returns this for method chaining
   */
  rename(name: string): this {
    const customization = this.customizationStore.getCustomization(this.table);
    this.customizationStore.addCustomization({
      ...customization,
      customization: {
        ...customization.customization,
        rename: name,
      },
    });
    return this;
  }

  /**
   * Rename a column
   * @param columnName - The column to rename
   * @param name - The new display name for the column
   * @returns this for method chaining
   */
  renameColumn<K extends ColumnName<T>>(
    columnName: K,
    name: string
  ): this {
    this.customizationStore.addColumnCustomization(
      this.table,
      columnName,
      { rename: name }
    );
    return this;
  }

  /**
   * Add a display field with a callback function
   * @param name - The name of the display field
   * @param callback - Function that receives record data and returns the display value
   * @returns this for method chaining
   */
  addDisplayField(
    name: string,
    callback: (record: DBManagerSchema.RowBy<T>) => any
  ): this {
    const customization = this.customizationStore.getCustomization(this.table);
    const displayFields = customization.customization.displayFields || [];

    this.customizationStore.addCustomization({
      ...customization,
      customization: {
        ...customization.customization,
        displayFields: [
          ...displayFields,
          { name, callback },
        ],
      },
    });
    return this;
  }

  /* ----------------- Action Registries ------------- */
  private actionRegistry = ActionRegistry.instance;

  /**
   * Register a table action that operates on multiple records
   * @param id - The id of the action (no spaces or special characters)
   * @param label - The display label for the action
   * @param callback - Function that receives array of records and performs the action
   * @param options.segmentId - If set, action only appears in this segment
   * @returns this for method chaining
   */
  registerTableAction(
    id: string,
    label: string,
    callback: (request: Request, records: DBManagerSchema.RowBy<T>[], db: DatabaseHandler) => any,
    options?: { segmentId?: string }
  ): this {
    this.actionRegistry.registerTableAction(this.table, id, callback, options?.segmentId);

    const customization = this.customizationStore.getCustomization(this.table);
    const tableActions = customization.customization.tableActions || [];

    this.customizationStore.addCustomization({
      ...customization,
      customization: {
        ...customization.customization,
        tableActions: [
          ...tableActions,
          { id, label, ...(options?.segmentId ? { segmentId: options.segmentId } : {}) },
        ],
      },
    });
    return this;
  }

  /**
   * Register a detail/record action that operates on a single record
   * @param id - The id of the action (no spaces or special characters)
   * @param label - The display label for the action
   * @param callback - Function that receives a single record and performs the action
   * @param options.segmentId - If set, action only appears in this segment
   * @returns this for method chaining
   */
  registerDetailAction(
    id: string,
    label: string,
    callback: (request: Request, record: DBManagerSchema.RowBy<T>, db: DatabaseHandler) => any,
    options?: { segmentId?: string }
  ): this {
    this.actionRegistry.registerDetailAction(this.table, id, callback, options?.segmentId);

    const customization = this.customizationStore.getCustomization(this.table);
    const recordActions = customization.customization.recordActions || [];

    this.customizationStore.addCustomization({
      ...customization,
      customization: {
        ...customization.customization,
        recordActions: [
          ...recordActions,
          { id, label, ...(options?.segmentId ? { segmentId: options.segmentId } : {}) },
        ],
      },
    });
    return this;
  }

  addAction({ type, id, label, callback, segmentId }: {
    type: "table" | "detail",
    id: string,
    label: string,
    callback: (request: Request, records: DBManagerSchema.RowBy<T> | DBManagerSchema.RowBy<T>[], db: DatabaseHandler) => any,
    segmentId?: string,
  }) {
    if (type === "table") {
      return this.registerTableAction(id, label, callback as any, { segmentId });
    } else {
      return this.registerDetailAction(id, label, callback as any, { segmentId });
    }
  }

  /* ----------------- Segments ------------- */

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
  }): Segment {
    const customization = this.customizationStore.getCustomization(this.table);
    const segments = customization.customization.segments ?? [];
    const slug = uniqueSlug(input.slug ?? input.name, segments.map((s) => s.slug));
    const order = segments.length
      ? Math.max(...segments.map((s) => s.order)) + 1
      : 0;

    const segment: Segment = {
      id: randomId(),
      slug,
      name: input.name,
      conditions: input.conditions ?? [],
      visibility: input.visibility ?? "visible",
      order,
    };

    this.customizationStore.addCustomization({
      ...customization,
      customization: {
        ...customization.customization,
        segments: [...segments, segment],
      },
    });

    return segment;
  }

  /**
   * Update a segment by slug. Slug itself can be changed via `patch.slug`
   * (will be re-slugified and de-duplicated against other segments).
   */
  updateSegment(slug: string, patch: Partial<Omit<Segment, "id">>): Segment | null {
    const customization = this.customizationStore.getCustomization(this.table);
    const segments = customization.customization.segments ?? [];
    const idx = segments.findIndex((s) => s.slug === slug);
    if (idx === -1) return null;

    const others = segments.filter((_, i) => i !== idx).map((s) => s.slug);
    const nextSlug = patch.slug
      ? uniqueSlug(patch.slug, others)
      : segments[idx].slug;

    const updated: Segment = {
      ...segments[idx],
      ...patch,
      slug: nextSlug,
    };
    const nextSegments = [...segments];
    nextSegments[idx] = updated;

    this.customizationStore.addCustomization({
      ...customization,
      customization: {
        ...customization.customization,
        segments: nextSegments,
      },
    });
    return updated;
  }

  deleteSegment(slug: string): boolean {
    const customization = this.customizationStore.getCustomization(this.table);
    const segments = customization.customization.segments ?? [];
    const next = segments.filter((s) => s.slug !== slug);
    if (next.length === segments.length) return false;

    this.customizationStore.addCustomization({
      ...customization,
      customization: {
        ...customization.customization,
        segments: next.map((s, i) => ({ ...s, order: i })),
      },
    });
    return true;
  }

  /** Reorder segments by providing the desired slug order. Unknown slugs are ignored. */
  reorderSegments(slugs: string[]): Segment[] {
    const customization = this.customizationStore.getCustomization(this.table);
    const segments = customization.customization.segments ?? [];
    const bySlug = new Map(segments.map((s) => [s.slug, s]));
    const ordered: Segment[] = [];
    slugs.forEach((slug, i) => {
      const seg = bySlug.get(slug);
      if (seg) {
        ordered.push({ ...seg, order: i });
        bySlug.delete(slug);
      }
    });
    // Append any segments not mentioned in the reorder list
    let nextOrder = ordered.length;
    bySlug.forEach((seg) => {
      ordered.push({ ...seg, order: nextOrder++ });
    });

    this.customizationStore.addCustomization({
      ...customization,
      customization: {
        ...customization.customization,
        segments: ordered,
      },
    });
    return ordered;
  }

  getSegment(slug: string): Segment | undefined {
    const customization = this.customizationStore.getCustomization(this.table);
    return customization.customization.segments?.find((s) => s.slug === slug);
  }

  listSegments(): Segment[] {
    const customization = this.customizationStore.getCustomization(this.table);
    return [...(customization.customization.segments ?? [])].sort(
      (a, b) => a.order - b.order
    );
  }

  /* ----------------- Integrations ------------- */
  private integrations = IntegrationRegistry.instance;

  /**
   * Retrieve a registered integration by ID
   * @param id - The integration ID
   * @returns The integration instance or undefined if not found
   */
  using<I>(id: string): I | undefined {
    return this.integrations.get<I>(id);
  }

  /**
   * Check if an integration is registered
   * @param id - The integration ID
   * @returns true if the integration exists, false otherwise
   */
  hasIntegration(id: string): boolean {
    return this.integrations.has(id);
  }

  /**
   * List all registered integration IDs
   * @returns Array of all integration IDs
   */
  listIntegrations(): string[] {
    return this.integrations.getAllIds();
  }
}

// Re-export slugify for callers that want to derive slugs externally
export { slugify };
