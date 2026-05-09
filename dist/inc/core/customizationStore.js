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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9taXphdGlvblN0b3JlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL2luYy9jb3JlL2N1c3RvbWl6YXRpb25TdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHQSxrREFJNEI7QUFDNUIsZ0RBQXdCO0FBQ3hCLDhEQUE2QjtBQUM3QixtRUFBdUU7QUFDdkUsb0VBQTRDO0FBQzVDLHdEQUF3RDtBQWlCeEQsTUFBYSxrQkFBa0I7SUFBL0I7UUFFVSxtQkFBYyxHQUNwQixFQUFFLENBQUM7UUFDRyxhQUFRLEdBQW9CLEVBQUUsQ0FBQztRQUMvQixrQkFBYSxHQUFrQix1QkFBYSxDQUFDLFFBQVEsQ0FBQztJQW9OaEUsQ0FBQztJQWxOQyxNQUFNLEtBQUssUUFBUTtRQUNqQixJQUFJLENBQUMsdUJBQUEsSUFBSSxrREFBb0IsRUFBRSxDQUFDO1lBQzlCLHVCQUFBLElBQUksTUFBdUIsSUFBSSxFQUFrQixFQUFFLDhDQUFBLENBQUM7UUFDdEQsQ0FBQztRQUNELE9BQU8sdUJBQUEsSUFBSSxrREFBb0IsQ0FBQztJQUNsQyxDQUFDO0lBRU0sSUFBSTtRQUNULE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUM3QixJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUM7UUFDMUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ2hDLENBQUM7SUFFTyxRQUFRO1FBQ2QsTUFBTSxPQUFPLEdBQUcsSUFBQSw4QkFBZSxHQUFFLENBQUM7UUFDbEMsTUFBTSxRQUFRLEdBQUcsY0FBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsb0NBQXdCLENBQUMsQ0FBQztRQUU5RCxJQUFJLENBQUMscUJBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUM3QixxQkFBRSxDQUFDLFNBQVMsQ0FBQyxjQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDMUQscUJBQUUsQ0FBQyxhQUFhLENBQ2QsUUFBUSxFQUNSLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxjQUFjLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQzdELE9BQU8sQ0FDUixDQUFDO1lBQ0YsT0FBTyxFQUFFLGNBQWMsRUFBRSxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQzlDLENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNsQyxNQUFNLEdBQUcsR0FBRyxxQkFBRSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFL0MsSUFBSSxDQUFDO1lBQ0gsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUUvQixrRkFBa0Y7WUFDbEYsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQzFCLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNsRCxDQUFDO1lBRUQsT0FBTztnQkFDTCxjQUFjLEVBQUUsTUFBTSxDQUFDLGNBQWMsSUFBSSxFQUFFO2dCQUMzQyxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVEsSUFBSSxFQUFFO2FBQ2hDLENBQUM7UUFDSixDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0JBQWtCLEdBQUcsb0NBQXdCLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDaEUscUJBQUUsQ0FBQyxTQUFTLENBQUMsY0FBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQzFELHFCQUFFLENBQUMsYUFBYSxDQUNkLFFBQVEsRUFDUixJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsY0FBYyxFQUFFLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUM3RCxPQUFPLENBQ1IsQ0FBQztZQUNGLE9BQU8sRUFBRSxjQUFjLEVBQUUsRUFBRSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUM5QyxDQUFDO0lBQ0gsQ0FBQztJQUVPLFNBQVM7UUFDZixNQUFNLE9BQU8sR0FBRyxJQUFBLDhCQUFlLEdBQUUsQ0FBQztRQUNsQyxNQUFNLFFBQVEsR0FBRyxjQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxvQ0FBd0IsQ0FBQyxDQUFDO1FBQzlELE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ2xDLHFCQUFFLENBQUMsU0FBUyxDQUFDLGNBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUUxRCxNQUFNLElBQUksR0FBYztZQUN0QixjQUFjLEVBQUUsSUFBSSxDQUFDLGNBQWM7WUFDbkMsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1NBQ3hCLENBQUM7UUFDRixxQkFBRSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRW5FLElBQUksQ0FBQztZQUNILE1BQU0sTUFBTSxHQUFHLElBQUEsd0NBQXNCLEVBQ25DLHVCQUFhLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFDcEM7Z0JBQ0UsTUFBTSxFQUFFLFdBQVc7Z0JBQ25CLFFBQVEsRUFBRSxvQkFBb0I7Z0JBQzlCLGlCQUFpQixFQUFFLElBQUk7Z0JBQ3ZCLE1BQU0sRUFBRSw0REFBNEQ7Z0JBQ3BFLGNBQWMsRUFBRSxJQUFJLENBQUMsY0FBYztnQkFDbkMsZUFBZSxFQUFFLElBQUk7YUFDdEIsQ0FDRixDQUFDO1lBQ0YsT0FBTyxDQUFDLEdBQUcsQ0FDVCxTQUFTLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsWUFBWSxLQUFLLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FDekUsQ0FBQztRQUNKLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQyx3Q0FBd0MsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3RCxDQUFDO0lBQ0gsQ0FBQztJQUVELHlCQUF5QjtJQUVsQixnQkFBZ0IsQ0FDckIsYUFBc0U7UUFFdEUsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FDcEQsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssYUFBYSxDQUFDLElBQUksQ0FDckMsQ0FBQztRQUNGLElBQUkscUJBQXFCLEVBQUUsQ0FBQztZQUMxQixPQUFPLENBQUMsR0FBRyxDQUNULDhCQUE4QixFQUM5QixxQkFBcUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUNyQyxDQUFDO1lBQ0YscUJBQXFCLENBQUMsYUFBYSxHQUFHLGFBQWEsQ0FBQyxhQUFhLENBQUM7UUFDcEUsQ0FBQzthQUFNLENBQUM7WUFDTixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUN4RCxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxhQUFhLENBQUMsSUFBSSxDQUNyQyxDQUFDO1lBQ0YsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDVixLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO29CQUMxQixhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQzt3QkFDekIsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJO3dCQUNaLGFBQWEsRUFBRSxzQ0FBMEI7cUJBQzFDLENBQUMsQ0FBQztnQkFDTCxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7WUFDRCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUMxQyxDQUFDO1FBRUQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBRWpCLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUMxQixhQUFhLENBQUMsSUFBaUMsQ0FDaEQsQ0FBQztJQUNKLENBQUM7SUFFTSxzQkFBc0IsQ0FDM0IsS0FBZ0MsRUFDaEMsTUFBUyxFQUNULGFBQW1EO1FBRW5ELE1BQU0scUJBQXFCLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQ3BELENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FDeEIsQ0FBQztRQUNGLElBQUkscUJBQXFCLEVBQUUsQ0FBQztZQUMxQixNQUFNLG1CQUFtQixHQUFHLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQzVELENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FDekIsQ0FBQztZQUNGLElBQUksbUJBQW1CLEVBQUUsQ0FBQztnQkFDeEIsbUJBQW1CLENBQUMsYUFBYSxHQUFHO29CQUNsQyxHQUFHLG1CQUFtQixDQUFDLGFBQWE7b0JBQ3BDLEdBQUcsYUFBYTtpQkFDakIsQ0FBQztZQUNKLENBQUM7aUJBQU0sQ0FBQztnQkFDTixxQkFBcUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO29CQUNqQyxJQUFJLEVBQUUsTUFBTTtvQkFDWixhQUFhLEVBQUUsRUFBRSxHQUFHLHNDQUEwQixFQUFFLEdBQUcsYUFBYSxFQUFFO2lCQUNuRSxDQUFDLENBQUM7WUFDTCxDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDTixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUM1RCxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxLQUFLLENBQ3hCLENBQUM7WUFDRixNQUFNLGlCQUFpQixHQUNyQixFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxhQUFhLEVBQUUscUNBQXlCLEVBQUUsQ0FBQztZQUN6RSxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNkLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7b0JBQzlCLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQzt3QkFDdEIsaUJBQWlCLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQzs0QkFDN0IsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJOzRCQUNaLGFBQWEsRUFBRTtnQ0FDYixHQUFHLHNDQUEwQjtnQ0FDN0IsR0FBRyxhQUFhOzZCQUNqQjt5QkFDRixDQUFDLENBQUM7b0JBQ0wsQ0FBQzt5QkFBTSxDQUFDO3dCQUNOLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUM7NEJBQzdCLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTs0QkFDWixhQUFhLEVBQUUsc0NBQTBCO3lCQUMxQyxDQUFDLENBQUM7b0JBQ0wsQ0FBQztnQkFDSCxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7WUFFRCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFFakIsT0FBTyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBa0MsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFTSxnQkFBZ0IsQ0FDckIsU0FBb0M7UUFFcEMsT0FBTyxDQUNMLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxJQUFJO1lBQ3ZELElBQUksRUFBRSxTQUFTO1lBQ2YsYUFBYSxFQUFFLHFDQUF5QjtZQUN4QyxPQUFPLEVBQ0wsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQUMsTUFBTTtpQkFDcEMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQztnQkFDbEMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNwQixJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUk7Z0JBQ1osYUFBYSxFQUFFLHNDQUEwQjthQUMxQyxDQUFDLENBQUMsSUFBSSxFQUFFO1NBQ2QsQ0FDRixDQUFDO0lBQ0osQ0FBQztJQUVNLE1BQU07UUFDWCxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUM7SUFDN0IsQ0FBQztJQUVELG1CQUFtQjtJQUVaLFdBQVc7UUFDaEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3ZCLENBQUM7SUFFTSxXQUFXLENBQUMsUUFBeUI7UUFDMUMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ25CLENBQUM7Q0FDRjtBQXpORCxnREF5TkM7O0FBeE5RLDBEQUFtQixDQUFxQiJ9