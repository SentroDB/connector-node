"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _a, _HookEngine_instance;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HookEngine = void 0;
class HookEngine {
    constructor() {
        this.customizers = new Map();
    }
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _HookEngine_instance))
            __classPrivateFieldSet(this, _a, new _a(), "f", _HookEngine_instance);
        return __classPrivateFieldGet(this, _a, "f", _HookEngine_instance);
    }
    register(factory) {
        const model = factory();
        this.customizers.set(model.table, model);
        return this;
    }
    get(table) {
        return this.customizers.get(table);
    }
    async runBefore(table, op, payload) {
        const model = this.get(table);
        if (!model)
            return payload;
        const ctx = { table, op };
        return (await model.runBefore(op, payload, ctx));
    }
    async runAfter(table, op, result) {
        const model = this.get(table);
        const ctx = { table, op };
        if (!model) {
            return result;
        }
        return (await model.runAfter(op, result, ctx));
    }
    async applyFieldWriters(table, op, payload) {
        const model = this.get(table);
        if (!model)
            return payload;
        const ctx = { table, op };
        return model.applyFieldWriters(payload, ctx);
    }
}
exports.HookEngine = HookEngine;
_a = HookEngine;
_HookEngine_instance = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG9vay1lbmdpbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3NlcnZpY2VzL2hvb2stZW5naW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQVFBLE1BQWEsVUFBVTtJQUF2QjtRQU9VLGdCQUFXLEdBQUcsSUFBSSxHQUFHLEVBRzFCLENBQUM7SUFtRE4sQ0FBQztJQTNEQyxNQUFNLEtBQUssUUFBUTtRQUNqQixJQUFJLENBQUMsdUJBQUEsSUFBSSxnQ0FBVTtZQUFFLHVCQUFBLElBQUksTUFBYSxJQUFJLEVBQVUsRUFBRSw0QkFBQSxDQUFDO1FBQ3ZELE9BQU8sdUJBQUEsSUFBSSxnQ0FBVSxDQUFDO0lBQ3hCLENBQUM7SUFPRCxRQUFRLENBQ04sT0FBaUM7UUFFakMsTUFBTSxLQUFLLEdBQUcsT0FBTyxFQUF3QixDQUFDO1FBQzlDLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDekMsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQsR0FBRyxDQUFzQyxLQUFRO1FBQy9DLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFtQyxDQUFDO0lBQ3ZFLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUNiLEtBQVEsRUFDUixFQUFLLEVBQ0wsT0FBMEI7UUFFMUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5QixJQUFJLENBQUMsS0FBSztZQUFFLE9BQU8sT0FBTyxDQUFDO1FBQzNCLE1BQU0sR0FBRyxHQUFzQixFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUM3QyxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxPQUFjLEVBQUUsR0FBRyxDQUFDLENBQVEsQ0FBQztJQUNqRSxDQUFDO0lBRUQsS0FBSyxDQUFDLFFBQVEsQ0FDWixLQUFRLEVBQ1IsRUFBSyxFQUNMLE1BQTZCO1FBRTdCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUIsTUFBTSxHQUFHLEdBQXNCLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzdDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNYLE9BQU8sTUFBK0IsQ0FBQztRQUN6QyxDQUFDO1FBQ0QsT0FBTyxDQUFDLE1BQU0sS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUEwQixDQUFDO0lBQzFFLENBQUM7SUFFRCxLQUFLLENBQUMsaUJBQWlCLENBSXJCLEtBQVEsRUFDUixFQUFLLEVBQ0wsT0FBZ0M7UUFFaEMsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5QixJQUFJLENBQUMsS0FBSztZQUFFLE9BQU8sT0FBTyxDQUFDO1FBQzNCLE1BQU0sR0FBRyxHQUFzQixFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUM3QyxPQUFPLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDL0MsQ0FBQztDQUNGO0FBN0RELGdDQTZEQzs7QUE1RFEsd0NBQVMsQ0FBYSJ9