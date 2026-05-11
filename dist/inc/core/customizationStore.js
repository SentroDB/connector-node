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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _CustomizationStore_CustomizationStore;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomizationStore = void 0;
const constants_1 = require("../utils/constants");
const path_1 = __importDefault(require("path"));
const graceful_fs_1 = __importDefault(require("graceful-fs"));
const types_generator_1 = require("../generators/types.generator");
const serverMounter_1 = __importDefault(require("./serverMounter"));
const file_handler_1 = require("../utils/file-handler");
class CustomizationStore {
    constructor() {
        this.customizations = [];
        this.webhooks = [];
        this.serverMounter = serverMounter_1.default.instance;
    }
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _CustomizationStore_CustomizationStore)) {
            __classPrivateFieldSet(this, _a, new _a(), "f", _CustomizationStore_CustomizationStore);
        }
        return __classPrivateFieldGet(this, _a, "f", _CustomizationStore_CustomizationStore);
    }
    load() {
        const data = this.readFile();
        this.customizations = data.customizations;
        this.webhooks = data.webhooks;
    }
    readFile() {
        const rootDir = (0, file_handler_1.findProjectRoot)();
        const filePath = path_1.default.join(rootDir, constants_1.CUSTOMIZATIONS_FILE_NAME);
        if (!graceful_fs_1.default.existsSync(filePath)) {
            graceful_fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
            graceful_fs_1.default.writeFileSync(filePath, JSON.stringify({ customizations: [], webhooks: [] }, null, 2), "utf-8");
            return { customizations: [], webhooks: [] };
        }
        console.log("Reading:", filePath);
        const raw = graceful_fs_1.default.readFileSync(filePath, "utf-8");
        try {
            const parsed = JSON.parse(raw);
            // Backwards compatibility: if file is a plain array, treat as customizations only
            if (Array.isArray(parsed)) {
                return { customizations: parsed, webhooks: [] };
            }
            return {
                customizations: parsed.customizations ?? [],
                webhooks: parsed.webhooks ?? [],
            };
        }
        catch (e) {
            console.error("Failed to parse " + constants_1.CUSTOMIZATIONS_FILE_NAME, e);
            graceful_fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
            graceful_fs_1.default.writeFileSync(filePath, JSON.stringify({ customizations: [], webhooks: [] }, null, 2), "utf-8");
            return { customizations: [], webhooks: [] };
        }
    }
    writeFile() {
        const rootDir = (0, file_handler_1.findProjectRoot)();
        const filePath = path_1.default.join(rootDir, constants_1.CUSTOMIZATIONS_FILE_NAME);
        console.log("Writing:", filePath);
        graceful_fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
        const data = {
            customizations: this.customizations,
            webhooks: this.webhooks,
        };
        graceful_fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
        try {
            const result = (0, types_generator_1.generateDbManagerTypes)(serverMounter_1.default.instance.schemaDetails, {
                outDir: "../.admin",
                fileName: "types.ts",
                preferRequireMain: true,
                banner: "Derived from schemaDetails + customizations.json",
                customizations: this.customizations,
                skipIfUnchanged: true,
            });
            console.log(`Types ${result.written ? "written" : "up-to-date"}: ${result.filePath}`);
        }
        catch (e) {
            console.error("Failed to generate types.ts:", e);
        }
    }
    // ─── Customizations ───
    addCustomization(customization) {
        const existingCustomization = this.customizations.find((c) => c.name === customization.name);
        if (existingCustomization) {
            console.log("Existing customization found", existingCustomization.columns.length);
            existingCustomization.customization = customization.customization;
        }
        else {
            const table = this.serverMounter.schemaDetails.tables.find((t) => t.name === customization.name);
            if (table) {
                table.columns.forEach((c) => {
                    customization.columns.push({
                        name: c.name,
                        customization: constants_1.EMPTY_COLUMN_CUSTOMIZATION,
                    });
                });
            }
            this.customizations.push(customization);
        }
        this.writeFile();
        return this.getCustomization(customization.name);
    }
    addColumnCustomization(table, column, customization) {
        const existingCustomization = this.customizations.find((c) => c.name === table);
        if (existingCustomization) {
            const columnCustomization = existingCustomization.columns.find((c) => c.name === column);
            if (columnCustomization) {
                columnCustomization.customization = {
                    ...columnCustomization.customization,
                    ...customization,
                };
            }
            else {
                existingCustomization.columns.push({
                    name: column,
                    customization: { ...constants_1.EMPTY_COLUMN_CUSTOMIZATION, ...customization },
                });
            }
        }
        else {
            const tableData = this.serverMounter.schemaDetails.tables.find((t) => t.name === table);
            const customizationData = { name: table, columns: [], customization: constants_1.EMPTY_TABLE_CUSTOMIZATION };
            if (tableData) {
                tableData.columns.forEach((c) => {
                    if (c.name === column) {
                        customizationData.columns.push({
                            name: c.name,
                            customization: {
                                ...constants_1.EMPTY_COLUMN_CUSTOMIZATION,
                                ...customization,
                            },
                        });
                    }
                    else {
                        customizationData.columns.push({
                            name: c.name,
                            customization: constants_1.EMPTY_COLUMN_CUSTOMIZATION,
                        });
                    }
                });
            }
            this.customizations.push(customizationData);
        }
        this.writeFile();
        return this.getCustomization(table);
    }
    getCustomization(modelName) {
        return (this.customizations.find((c) => c.name === modelName) ?? {
            name: modelName,
            customization: constants_1.EMPTY_TABLE_CUSTOMIZATION,
            columns: this.serverMounter.schemaDetails.tables
                .find((t) => t.name === modelName)
                ?.columns.map((c) => ({
                name: c.name,
                customization: constants_1.EMPTY_COLUMN_CUSTOMIZATION,
            })) ?? [],
        });
    }
    getAll() {
        return this.customizations;
    }
    // ─── Webhooks ───
    getWebhooks() {
        return this.webhooks;
    }
    setWebhooks(webhooks) {
        this.webhooks = webhooks;
        this.writeFile();
    }
}
exports.CustomizationStore = CustomizationStore;
_a = CustomizationStore;
_CustomizationStore_CustomizationStore = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvblN0b3JlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy9jb3JlL2N1c3RvbWl6YXRpb25TdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHQSxrREFJNEI7QUFDNUIsZ0RBQXdCO0FBQ3hCLDhEQUE2QjtBQUM3QixtRUFBdUU7QUFDdkUsb0VBQTRDO0FBQzVDLHdEQUF3RDtBQWlCeEQsTUFBYSxrQkFBa0I7SUFBL0I7UUFFVSxtQkFBYyxHQUNwQixFQUFFLENBQUM7UUFDRyxhQUFRLEdBQW9CLEVBQUUsQ0FBQztRQUMvQixrQkFBYSxHQUFrQix1QkFBYSxDQUFDLFFBQVEsQ0FBQztJQW9OaEUsQ0FBQztJQWxOQyxNQUFNLEtBQUssUUFBUTtRQUNqQixJQUFJLENBQUMsdUJBQUEsSUFBSSxrREFBb0IsRUFBRSxDQUFDO1lBQzlCLHVCQUFBLElBQUksTUFBdUIsSUFBSSxFQUFrQixFQUFFLDhDQUFBLENBQUM7UUFDdEQsQ0FBQztRQUNELE9BQU8sdUJBQUEsSUFBSSxrREFBb0IsQ0FBQztJQUNsQyxDQUFDO0lBRU0sSUFBSTtRQUNULE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUM3QixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUM7UUFDMUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ2hDLENBQUM7SUFFTyxRQUFRO1FBQ2QsTUFBTSxPQUFPLEdBQUcsSUFBQSw4QkFBZSxHQUFFLENBQUM7UUFDbEMsTUFBTSxRQUFRLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsb0NBQXdCLENBQUMsQ0FBQztRQUU5RCxJQUFJLENBQUMscUJBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUM3QixxQkFBRSxDQUFDLFNBQVMsQ0FBQyxjQUFJ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