import { ModelCustomizer } from "../customizers/modelCustomizer";
import type {
  BaseContext,
  Operation,
  PayloadByOp,
  ResultArrayByOp,
} from "../types/modelCustomizer";

export class HookEngine {
  static #instance: HookEngine;
  static get instance() {
    if (!this.#instance) this.#instance = new HookEngine();
    return this.#instance;
  }

  private customizers = new Map<
    DBManagerSchema.TableName,
    ModelCustomizer<any>
  >();

  register<T extends DBManagerSchema.TableName>(
    factory: () => ModelCustomizer<T>
  ) {
    const model = factory() as ModelCustomizer<T>;
    this.customizers.set(model.table, model);
    return this;
  }

  get<T extends DBManagerSchema.TableName>(table: T) {
    return this.customizers.get(table) as ModelCustomizer<T> | undefined;
  }

  async runBefore<T extends DBManagerSchema.TableName, O extends Operation>(
    table: T,
    op: O,
    payload: PayloadByOp<T, O>
  ): Promise<PayloadByOp<T, O>> {
    const model = this.get(table);
    if (!model) return payload;
    const ctx: BaseContext<T, O> = { table, op };
    return (await model.runBefore(op, payload as any, ctx)) as any;
  }

  async runAfter<T extends DBManagerSchema.TableName, O extends Operation>(
    table: T,
    op: O,
    result: ResultArrayByOp<T, O>
  ): Promise<ResultArrayByOp<T, O>> {
    const model = this.get(table);
    const ctx: BaseContext<T, O> = { table, op };
    if (!model) {
      return result as ResultArrayByOp<T, O>;
    }
    return (await model.runAfter(op, result, ctx)) as ResultArrayByOp<T, O>;
  }

  async applyFieldWriters<
    T extends DBManagerSchema.TableName,
    O extends Extract<Operation, "CREATE" | "UPDATE">
  >(
    table: T,
    op: O,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const model = this.get(table);
    if (!model) return payload;
    const ctx: BaseContext<T, O> = { table, op };
    return model.applyFieldWriters(payload, ctx);
  }
}
