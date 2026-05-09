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
var _a, _Customizer_Customizer;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Customizer = void 0;
const constants_1 = require("../utils/constants");
const path_1 = __importDefault(require("path"));
const graceful_fs_1 = __importDefault(require("graceful-fs"));
const serverMounter_1 = __importDefault(require("../core/serverMounter"));
const types_generator_1 = require("../generators/types.generator");
class Customizer {
    static get instance() {
        if (!__classPrivateFieldGet(this, _a, "f", _Customizer_Customizer)) {
            __classPrivateFieldSet(this, _a, new _a(), "f", _Customizer_Customizer);
        }
        return __classPrivateFieldGet(this, _a, "f", _Customizer_Customizer);
    }
    constructor() {
        this.serverMounter = serverMounter_1.default.instance;
        this.customizations = this.readCustomizations();
        this.fillCustomizationsIntoSchema();
    }
    getCustomization(modelName) {
        return this.customizations.find((c) => c.name === modelName) ?? { name: modelName, customization: constants_1.EMPTY_TABLE_CUSTOMIZATION, columns: this.serverMounter.schemaDetails.tables.find((t) => t.name === modelName)?.columns.map((c) => ({ name: c.name, customization: constants_1.EMPTY_COLUMN_CUSTOMIZATION })) ?? [] };
    }
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
                    customization.columns.push({ name: c.name, customization: constants_1.EMPTY_COLUMN_CUSTOMIZATION });
                });
            }
            this.customizations.push(customization);
        }
        this.writeCustomizations();
        return this.getCustomization(customization.name);
    }
    addColumnCustomization(table, column, customization) {
        const existingCustomization = this.customizations.find((c) => c.name === table);
        if (existingCustomization) {
            const columnCustomization = existingCustomization.columns.find((c) => c.name === column);
            if (columnCustomization) {
                columnCustomization.customization = { ...columnCustomization.customization, ...customization };
            }
            else {
                existingCustomization.columns.push({ name: column, customization: { ...constants_1.EMPTY_COLUMN_CUSTOMIZATION, ...customization } });
            }
        }
        else {
            const tableData = this.serverMounter.schemaDetails.tables.find((t) => t.name === table);
            const customizationData = { name: table, columns: [], customization: constants_1.EMPTY_TABLE_CUSTOMIZATION };
            if (tableData) {
                tableData.columns.forEach((c) => {
                    if (c.name === column) {
                        customizationData.columns.push({ name: c.name, customization: { ...constants_1.EMPTY_COLUMN_CUSTOMIZATION, ...customization } });
                    }
                    else {
                        customizationData.columns.push({ name: c.name, customization: constants_1.EMPTY_COLUMN_CUSTOMIZATION });
                    }
                });
            }
            this.customizations.push(customizationData);
        }
        this.writeCustomizations();
        return this.getCustomization(table);
    }
    readCustomizations() {
        const rootDir = path_1.default.resolve(require.main?.path || process.cwd());
        const filePath = path_1.default.join(rootDir, `../${constants_1.CUSTOMIZATIONS_FILE_NAME}`);
        if (!graceful_fs_1.default.existsSync(filePath)) {
            graceful_fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
            graceful_fs_1.default.writeFileSync(filePath, JSON.stringify([], null, 2), "utf-8");
            return [];
        }
        console.log("Reading:", filePath);
        const raw = graceful_fs_1.default.readFileSync(filePath, "utf-8");
        try {
            return JSON.parse(raw);
        }
        catch (e) {
            console.error("❌ Failed to parse customizations.json", e);
            graceful_fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
            graceful_fs_1.default.writeFileSync(filePath, JSON.stringify([], null, 2), "utf-8");
            return [];
        }
    }
    writeCustomizations() {
        const rootDir = path_1.default.resolve(require.main?.path || process.cwd());
        const filePath = path_1.default.join(rootDir, `../${constants_1.CUSTOMIZATIONS_FILE_NAME}`);
        console.log("Writing:", filePath);
        graceful_fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
        graceful_fs_1.default.writeFileSync(filePath, JSON.stringify(this.customizations, null, 2), "utf-8");
        this.fillCustomizationsIntoSchema();
        try {
            const result = (0, types_generator_1.generateDbManagerTypes)(this.serverMounter.schemaDetails, {
                outDir: "../.admin",
                fileName: "dbmanager-types.ts",
                preferRequireMain: true,
                banner: "Derived from schemaDetails + dbmanager-customizations.json",
                customizations: this.customizations,
                skipIfUnchanged: true,
            });
            console.log(`Types ${result.written ? "written" : "up-to-date"}: ${result.filePath}`);
        }
        catch (e) {
            console.error("Failed to generate dbmanager-types.ts:", e);
        }
    }
    fillCustomizationsIntoSchema() {
        this.serverMounter.schemaDetails.tables.forEach((table) => {
            const customization = this.getCustomization(table.name);
            table.customization = customization.customization;
            table.columns.forEach((column) => {
                const columnCustomization = customization.columns.find((c) => c.name === column.name);
                column.customization = columnCustomization?.customization ?? constants_1.EMPTY_COLUMN_CUSTOMIZATION;
            });
        });
    }
}
exports.Customizer = Customizer;
_a = Customizer;
_Customizer_Customizer = { value: void 0 };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXplci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9pbmMvY3VzdG9taXplcnMvY3VzdG9taXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSxrREFBcUg7QUFDckgsZ0RBQXdCO0FBQ3hCLDhEQUE2QjtBQUM3QiwwRUFBa0Q7QUFDbEQsbUVBQXVFO0FBRXZFLE1BQWEsVUFBVTtJQUtaLE1BQU0sS0FBSyxRQUFRO1FBQ3RCLElBQUksQ0FBQyx1QkFBQSxJQUFJLGtDQUFZLEVBQUUsQ0FBQztZQUNwQix1QkFBQSxJQUFJLE1BQWUsSUFBSSxFQUFVLEVBQUUsOEJBQUEsQ0FBQztRQUN4QyxDQUFDO1FBQ0QsT0FBTyx1QkFBQSxJQUFJLGtDQUFZLENBQUM7SUFDNUIsQ0FBQztJQUVEO1FBVlEsa0JBQWEsR0FBa0IsdUJBQWEsQ0FBQyxRQUFRLENBQUM7UUFXMUQsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUVoRCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRU0sZ0JBQWdCLENBQUMsU0FBb0M7UUFFeEQsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxTQUFTLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLHFDQUF5QixFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFD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