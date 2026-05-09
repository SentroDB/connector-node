"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = exports.ModelCustomizer = void 0;
const customizationStore_1 = require("../core/customizationStore");
const action_registry_1 = require("../services/action-registry");
const helpers_1 = require("../utils/helpers");
Object.defineProperty(exports, "slugify", { enumerable: true, get: function () { return helpers_1.slugify; } });
class ModelCustomizer {
    constructor(table) {
        this.table = table;
        this.writers = new Map();
        /* --------------------- Hooks ----------------------- */
        this.before = new Map();
        this.after = new Map();
        /* ----------------- Customization Methods ------------- */
        this.customizationStore = customizationStore_1.CustomizationStore.instance;
        /* ----------------- Action Registries ------------- */
        this.actionRegistry = action_registry_1.ActionRegistry.instance;
    }
    replaceFieldWriting(field, handler) {
        this.writers.set(field, handler);
        return this;
    }
    async applyFieldWriters(payload, ctx) {
        if (!this.writers.size)
            return payload;
        const out = { ...payload };
        for (const [key, value] of Object.entries(payload)) {
            const writer = this.writers.get(key);
            if (!writer)
                continue;
            const patch = await writer(value, ctx);
            if (patch && typeof patch === "object")
                Object.assign(out, patch);
        }
        return out;
    }
    onBefore(op, handler) {
        const arr = this.before.get(op) ?? [];
        arr.push(handler);
        this.before.set(op, arr);
        return this;
    }
    onAfter(op, hook) {
        const list = this.after.get(op) ?? [];
        list.push(hook);
        this.after.set(op, list);
        return this;
    }
    async runBefore(op, payload, ctx) {
        const handlers = this.before.get(op) ?? [];
        let current = payload;
        for (const h of handlers) {
            const next = await h(current, ctx);
            if (next !== undefined)
                current = next;
        }
        return current;
    }
    async runAfter(op, result, ctx) {
        const list = this.after.get(op) ?? [];
        let out = (0, helpers_1.toArray)(result);
        for (const h of list) {
            const maybe = await h(out, ctx);
            if (typeof maybe !== "undefined") {
                out = (0, helpers_1.toArray)(maybe);
            }
        }
        return out;
    }
    /**
     * Rename the table/model
     * @param name - The new display name for the table
     * @returns this for method chaining
     */
    rename(name) {
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
    renameColumn(columnName, name) {
        this.customizationStore.addColumnCustomization(this.table, columnName, { rename: name });
        return this;
    }
    /**
     * Add a display field with a callback function
     * @param name - The name of the display field
     * @param callback - Function that receives record data and returns the display value
     * @returns this for method chaining
     */
    addDisplayField(name, callback) {
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
    /**
     * Register a table action that operates on multiple records
     * @param id - The id of the action (no spaces or special characters)
     * @param label - The display label for the action
     * @param callback - Function that receives array of records and performs the action
     * @param options.segmentId - If set, action only appears in this segment
     * @returns this for method chaining
     */
    registerTableAction(id, label, callback, options) {
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
    registerDetailAction(id, label, callback, options) {
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
    addAction({ type, id, label, callback, segmentId }) {
        if (type === "table") {
            return this.registerTableAction(id, label, callback, { segmentId });
        }
        else {
            return this.registerDetailAction(id, label, callback, { segmentId });
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
    createSegment(input) {
        const customization = this.customizationStore.getCustomization(this.table);
        const segments = customization.customization.segments ?? [];
        const slug = (0, helpers_1.uniqueSlug)(input.slug ?? input.name, segments.map((s) => s.slug));
        const order = segments.length
            ? Math.max(...segments.map((s) => s.order)) + 1
            : 0;
        const segment = {
            id: (0, helpers_1.randomId)(),
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
    updateSegment(slug, patch) {
        const customization = this.customizationStore.getCustomization(this.table);
        const segments = customization.customization.segments ?? [];
        const idx = segments.findIndex((s) => s.slug === slug);
        if (idx === -1)
            return null;
        const others = segments.filter((_, i) => i !== idx).map((s) => s.slug);
        const nextSlug = patch.slug
            ? (0, helpers_1.uniqueSlug)(patch.slug, others)
            : segments[idx].slug;
        const updated = {
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
    deleteSegment(slug) {
        const customization = this.customizationStore.getCustomization(this.table);
        const segments = customization.customization.segments ?? [];
        const next = segments.filter((s) => s.slug !== slug);
        if (next.length === segments.length)
            return false;
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
    reorderSegments(slugs) {
        const customization = this.customizationStore.getCustomization(this.table);
        const segments = customization.customization.segments ?? [];
        const bySlug = new Map(segments.map((s) => [s.slug, s]));
        const ordered = [];
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
    getSegment(slug) {
        const customization = this.customizationStore.getCustomization(this.table);
        return customization.customization.segments?.find((s) => s.slug === slug);
    }
    listSegments() {
        const customization = this.customizationStore.getCustomization(this.table);
        return [...(customization.customization.segments ?? [])].sort((a, b) => a.order - b.order);
    }
}
exports.ModelCustomizer = ModelCustomizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxDdXN0b21pemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy9jdXN0b21pemVycy9tb2RlbEN1c3RvbWl6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBTUEsbUVBQWdFO0FBQ2hFLGlFQUE2RDtBQVc3RCw4Q0FBMEU7QUFtV2pFLHdGQW5XVSxpQkFBTyxPQW1XVjtBQWpXaEIsTUFBYSxlQUFlO0lBQzFCLFlBQTRCLEtBQVE7UUFBUixVQUFLLEdBQUwsS0FBSyxDQUFHO1FBRTVCLFlBQU8sR0FBRyxJQUFJLEdBQUcsRUFBK0IsQ0FBQztRQXFCekQseURBQXlEO1FBQ2pELFdBQU0sR0FBRyxJQUFJLEdBQUcsRUFBOEMsQ0FBQztRQUMvRCxVQUFLLEdBQUcsSUFBSSxHQUFHLEVBQTZDLENBQUM7UUErQ3JFLDJEQUEyRDtRQUNuRCx1QkFBa0IsR0FBRyx1Q0FBa0IsQ0FBQyxRQUFRLENBQUM7UUErRHpELHVEQUF1RDtRQUMvQyxtQkFBYyxHQUFHLGdDQUFjLENBQUMsUUFBUSxDQUFDO0lBeklULENBQUM7SUFHekMsbUJBQW1CLENBQW1CLEtBQVEsRUFBRSxPQUEwQjtRQUN4RSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsT0FBOEIsQ0FBQyxDQUFDO1FBQ3hELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELEtBQUssQ0FBQyxpQkFBaUIsQ0FDckIsT0FBZ0MsRUFDaEMsR0FBd0M7UUFFeEMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSTtZQUFFLE9BQU8sT0FBTyxDQUFDO1FBQ3ZDLE1BQU0sR0FBRyxHQUFHLEVBQUUsR0FBRyxPQUFPLEVBQUUsQ0FBQztRQUMzQixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ25ELE1BQU0sTUFBTSxHQUFHLElB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