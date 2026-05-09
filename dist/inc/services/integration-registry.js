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
var _a, _IntegrationRegistry_instance;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationRegistry = void 0;
class IntegrationRegistry {
    constructor() {
        this.integrations = new Map();
    }
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _IntegrationRegistry_instance))
            __classPrivateFieldSet(this, _a, new _a(), "f", _IntegrationRegistry_instance);
        return __classPrivateFieldGet(this, _a, "f", _IntegrationRegistry_instance);
    }
    /**
     * Register an integration with a unique ID
     * @param id - Unique identifier for the integration
     * @param integration - The integration instance to register
     * @throws Error if ID is empty or integration already exists
     */
    register(id, integration) {
        if (!id || typeof id !== 'string' || id.trim() === '') {
            throw new Error('Integration ID must be a non-empty string');
        }
        if (integration === null || integration === undefined) {
            throw new Error('Integration cannot be null or undefined');
        }
        if (this.integrations.has(id)) {
            throw new Error(`Integration with ID "${id}" is already registered`);
        }
        this.integrations.set(id, integration);
    }
    /**
     * Retrieve an integration by ID
     * @param id - The integration ID
     * @returns The integration instance or undefined if not found
     */
    get(id) {
        return this.integrations.get(id);
    }
    /**
     * Check if an integration exists
     * @param id - The integration ID
     * @returns true if the integration exists, false otherwise
     */
    has(id) {
        return this.integrations.has(id);
    }
    /**
     * Remove an integration by ID
     * @param id - The integration ID
     * @returns true if removed, false if not found
     */
    remove(id) {
        return this.integrations.delete(id);
    }
    /**
     * Clear all registered integrations
     * Useful for testing
     */
    clear() {
        this.integrations.clear();
    }
    /**
     * Get all registered integration IDs
     * @returns Array of all integration IDs
     */
    getAllIds() {
        return Array.from(this.integrations.keys());
    }
}
exports.IntegrationRegistry = IntegrationRegistry;
_a = IntegrationRegistry;
_IntegrationRegistry_instance = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZWdyYXRpb24tcmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvaW5jL3NlcnZpY2VzL2ludGVncmF0aW9uLXJlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFBLE1BQWEsbUJBQW1CO0lBQWhDO1FBT1UsaUJBQVksR0FBRyxJQUFJLEdBQUcsRUFBbUIsQ0FBQztJQWtFcEQsQ0FBQztJQXZFQyxNQUFNLEtBQUssUUFBUTtRQUNqQixJQUFJLENBQUMsdUJBQUEsSUFBSSx5Q0FBVTtZQUFFLHVCQUFBLElBQUksTUFBYSxJQUFJLEVBQW1CLEVBQUUscUNBQUEsQ0FBQztRQUNoRSxPQUFPLHVCQUFBLElBQUkseUNBQVUsQ0FBQztJQUN4QixDQUFDO0lBSUQ7Ozs7O09BS0c7SUFDSCxRQUFRLENBQUksRUFBVSxFQUFFLFdBQWM7UUFDcEMsSUFBSSxDQUFDLEVBQUUsSUFBSSxPQUFPLEVBQUUsS0FBSyxRQUFRLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO1lBQ3RELE1BQU0sSUFBSSxLQUFLLENBQUMsMkNBQTJDLENBQUMsQ0FBQztRQUMvRCxDQUFDO1FBRUQsSUFBSSxXQUFXLEtBQUssSUFBSSxJQUFJLFdBQVcsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUN0RCxNQUFNLElBQUksS0FBSyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDN0QsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUM5QixNQUFNLElBQUksS0FBSyxDQUFDLHdCQUF3QixFQUFFLHlCQUF5QixDQUFDLENBQUM7UUFDdkUsQ0FBQztRQUVELElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUN6QyxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILEdBQUcsQ0FBSSxFQUFVO1FBQ2YsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQWtCLENBQUM7SUFDcEQsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxHQUFHLENBQUMsRUFBVTtRQUNaLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxNQUFNLENBQUMsRUFBVTtRQUNmLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUs7UUFDSCxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzVCLENBQUM7SUFFRDs7O09BR0c7SUFDSCxTQUFTO1FBQ1AsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUM5QyxDQUFDO0NBQ0Y7QUF6RUQsa0RBeUVDOztBQXhFUSxpREFBUyxDQUFzQiJ9