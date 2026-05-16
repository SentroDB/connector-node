import { GetDataBody } from "./global";

// export type SchemaRuntime = typeof DBManagerSchema;
export type ColumnName<T extends DBManagerSchema.TableName> =
    DBManagerSchema.ColumnBy<T>;
export type TableNameOf<S> =
    S extends { readonly tableNames: readonly (infer N)[] } ? Extract<N, string> : never;

export type OnAction = "BEFORE" | "AFTER";
export type Operation = "CREATE" | "READ" | "UPDATE" | "DELETE";

export interface BaseContext<T extends DBManagerSchema.TableName, O extends Operation> {
    table: T;
    op: O;
    // Extend later: user, tx, req, etc.
}

export type ListOf<T extends DBManagerSchema.TableName> = DBManagerSchema.ListBy<T>;
export type RowOf<T extends DBManagerSchema.TableName> = DBManagerSchema.RowBy<T>;

/** Payload shapes per operation (adjust to your real types later) */
export type PayloadByOp<T extends DBManagerSchema.TableName, O extends Operation> =
    O extends "CREATE" ? Record<string, unknown> :
    O extends "READ" ? GetDataBody :
    O extends "UPDATE" ? { where: Record<string, unknown>; patch: Record<string, unknown> } :
    O extends "DELETE" ? Array<RowOf<T>> :
    never;

export type ResultArrayByOp<
    T extends DBManagerSchema.TableName,
    O extends Operation
> =
    O extends "READ" ? ListOf<T> :
    O extends "CREATE" ? RowOf<T>[] :
    O extends "UPDATE" ? RowOf<T>[] :
    O extends "DELETE" ? RowOf<T>[] :
    never;

export type BeforeHook<T extends DBManagerSchema.TableName, O extends Operation> =
    (payload: PayloadByOp<T, O>, ctx: BaseContext<T, O>) =>
        Promise<PayloadByOp<T, O> | void> | (PayloadByOp<T, O> | void);

export type AfterHook<
    T extends DBManagerSchema.TableName,
    O extends Operation
> = (result: ResultArrayByOp<T, O>, ctx: BaseContext<T, O>) =>
        void | ResultArrayByOp<T, O> | Promise<void | ResultArrayByOp<T, O>>;

/** Field Writer (from your previous step) */
export type FieldWriter<
    T extends DBManagerSchema.TableName,
    K extends ColumnName<T>
> =
    (value: unknown, ctx: BaseContext<T, "CREATE" | "UPDATE">) =>
        Promise<Record<string, unknown> | void> | (Record<string, unknown> | void);
