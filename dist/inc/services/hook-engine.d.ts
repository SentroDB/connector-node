import { ModelCustomizer } from "../customizers/modelCustomizer";
import type { Operation, PayloadByOp, ResultArrayByOp } from "../types/modelCustomizer";
export declare class HookEngine {
    #private;
    static get instance(): HookEngine;
    private customizers;
    register<T extends DBManagerSchema.TableName>(factory: () => ModelCustomizer<T>): this;
    get<T extends DBManagerSchema.TableName>(table: T): ModelCustomizer<T> | undefined;
    runBefore<T extends DBManagerSchema.TableName, O extends Operation>(table: T, op: O, payload: PayloadByOp<T, O>): Promise<PayloadByOp<T, O>>;
    runAfter<T extends DBManagerSchema.TableName, O extends Operation>(table: T, op: O, result: ResultArrayByOp<T, O>): Promise<ResultArrayByOp<T, O>>;
    applyFieldWriters<T extends DBManagerSchema.TableName, O extends Extract<Operation, "CREATE" | "UPDATE">>(table: T, op: O, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}
//# sourceMappingURL=hook-engine.d.ts.map