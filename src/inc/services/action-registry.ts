import { Request } from "koa";
import { DatabaseHandler } from "../types/db";

const BASE_SCOPE = "__base__";

const scopeKey = (segmentId?: string) => segmentId ?? BASE_SCOPE;
const composite = (table: string, segmentId: string | undefined, id: string) =>
  `${table}::${scopeKey(segmentId)}::${id}`;

export class ActionRegistry {
  private static _instance: ActionRegistry;

  private tableActions = new Map<string, (request: Request, records: any[], db: DatabaseHandler) => any>();
  private detailActions = new Map<string, (request: Request, record: any, db: DatabaseHandler) => any>();

  private constructor() {}

  static get instance(): ActionRegistry {
    if (!ActionRegistry._instance) {
      ActionRegistry._instance = new ActionRegistry();
    }
    return ActionRegistry._instance;
  }

  /**
   * Register a table action for a specific table (optionally scoped to a segment)
   */
  registerTableAction<T extends DBManagerSchema.TableName>(
    table: T,
    id: string,
    callback: (request: any, records: DBManagerSchema.RowBy<T>[], db: any) => any,
    segmentId?: string
  ): void {
    this.tableActions.set(composite(table, segmentId, id), callback);
  }

  /**
   * Register a detail action for a specific table (optionally scoped to a segment)
   */
  registerDetailAction<T extends DBManagerSchema.TableName>(
    table: T,
    id: string,
    callback: (request: any, record: DBManagerSchema.RowBy<T>, db: any) => any,
    segmentId?: string
  ): void {
    this.detailActions.set(composite(table, segmentId, id), callback);
  }

  /**
   * Get a table action callback. Looks up the segment-scoped action first, then
   * falls back to the table-base action of the same id.
   */
  getTableAction<T extends DBManagerSchema.TableName>(
    table: T,
    id: string,
    segmentId?: string
  ): ((request: any, records: DBManagerSchema.RowBy<T>[], db: any) => any) | undefined {
    if (segmentId) {
      const scoped = this.tableActions.get(composite(table, segmentId, id));
      if (scoped) return scoped;
    }
    return this.tableActions.get(composite(table, undefined, id));
  }

  /**
   * Get a detail action callback. Looks up segment-scoped first, then base.
   */
  getDetailAction<T extends DBManagerSchema.TableName>(
    table: T,
    id: string,
    segmentId?: string
  ): ((request: any, record: DBManagerSchema.RowBy<T>, db: any) => any) | undefined {
    if (segmentId) {
      const scoped = this.detailActions.get(composite(table, segmentId, id));
      if (scoped) return scoped;
    }
    return this.detailActions.get(composite(table, undefined, id));
  }

  /**
   * Get all registered table action ids visible in a given scope (segment + base).
   */
  getTableActionIds(table: string, segmentId?: string): string[] {
    return this.collectIds(this.tableActions, table, segmentId);
  }

  /**
   * Get all registered detail action ids visible in a given scope (segment + base).
   */
  getDetailActionIds(table: string, segmentId?: string): string[] {
    return this.collectIds(this.detailActions, table, segmentId);
  }

  private collectIds(map: Map<string, unknown>, table: string, segmentId?: string): string[] {
    const tablePrefix = `${table}::`;
    const ids = new Set<string>();
    for (const key of map.keys()) {
      if (!key.startsWith(tablePrefix)) continue;
      const rest = key.slice(tablePrefix.length);
      const sepIdx = rest.indexOf("::");
      if (sepIdx === -1) continue;
      const scope = rest.slice(0, sepIdx);
      const id = rest.slice(sepIdx + 2);
      if (scope === BASE_SCOPE || (segmentId && scope === segmentId)) {
        ids.add(id);
      }
    }
    return [...ids];
  }

  /** Clear all actions for a specific table (across all segments). */
  clearTableActions(table: string): void {
    const prefix = `${table}::`;
    for (const key of [...this.tableActions.keys()]) {
      if (key.startsWith(prefix)) this.tableActions.delete(key);
    }
    for (const key of [...this.detailActions.keys()]) {
      if (key.startsWith(prefix)) this.detailActions.delete(key);
    }
  }

  /** Clear actions for a specific segment of a table (preserves base actions). */
  clearSegmentActions(table: string, segmentId: string): void {
    const prefix = `${table}::${segmentId}::`;
    for (const key of [...this.tableActions.keys()]) {
      if (key.startsWith(prefix)) this.tableActions.delete(key);
    }
    for (const key of [...this.detailActions.keys()]) {
      if (key.startsWith(prefix)) this.detailActions.delete(key);
    }
  }

  /** Clear all actions */
  clearAll(): void {
    this.tableActions.clear();
    this.detailActions.clear();
  }
}
