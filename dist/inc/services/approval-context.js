"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalContext = void 0;
const async_hooks_1 = require("async_hooks");
/**
 * Async-local context for approval-aware request handling.
 * Routes wrap their handlers with `run` so deeper code (HookEngine, executors)
 * can read the current requester / replay flag without threading params.
 */
class ApprovalContext {
    static run(ctx, fn) {
        return this.storage.run(ctx, fn);
    }
    static current() {
        return this.storage.getStore();
    }
    static requester() {
        return this.storage.getStore()?.requester;
    }
    static isReplay() {
        return Boolean(this.storage.getStore()?.isReplay);
    }
}
exports.ApprovalContext = ApprovalContext;
ApprovalContext.storage = new async_hooks_1.AsyncLocalStorage();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwcm92YWwtY29udGV4dC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvc2VydmljZXMvYXBwcm92YWwtY29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw2Q0FBZ0Q7QUFRaEQ7Ozs7R0FJRztBQUNILE1BQWEsZUFBZTtJQUcxQixNQUFNLENBQUMsR0FBRyxDQUFJLEdBQXVCLEVBQUUsRUFBVztRQUNoRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsTUFBTSxDQUFDLE9BQU87UUFDWixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDakMsQ0FBQztJQUVELE1BQU0sQ0FBQyxTQUFTO1FBQ2QsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLFNBQVMsQ0FBQztJQUM1QyxDQUFDO0lBRUQsTUFBTSxDQUFDLFFBQVE7UUFDYixPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQ3BELENBQUM7O0FBakJILDBDQWtCQztBQWpCZ0IsdUJBQU8sR0FBRyxJQUFJLCtCQUFpQixFQUFzQixDQUFDIn0=