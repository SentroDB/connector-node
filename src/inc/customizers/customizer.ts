import DBManagerTypes, { Customization, SchemaDetails } from "@sentrodb/connector-node-types";
import { CUSTOMIZATIONS_FILE_NAME, EMPTY_COLUMN_CUSTOMIZATION, EMPTY_TABLE_CUSTOMIZATION } from "../utils/constants";
import path from "path";
import fs from "graceful-fs";
import ServerMounter from "../core/serverMounter";
import { generateDbManagerTypes } from "../generators/types.generator";

export class Customizer {
    static #Customizer: Customizer;
    private serverMounter: ServerMounter = ServerMounter.instance;
    private customizations: DBManagerTypes.Customization<DBManagerSchema.TableName>[];

    public static get instance() {
        if (!this.#Customizer) {
            this.#Customizer = new Customizer();
        }
        return this.#Customizer;
    }

    constructor() {
        this.customizations = this.readCustomizations();

        this.fillCustomizationsIntoSchema();
    }

    public getCustomization(modelName: DBManagerSchema.TableName): DBManagerTypes.Customization<DBManagerSchema.TableName> {

        return this.customizations.find((c) => c.name === modelName) ?? { name: modelName, customization: EMPTY_TABLE_CUSTOMIZATION, columns: this.serverMounter.schemaDetails.tables.find((t) => t.name === modelName)?.columns.map((c) => ({ name: c.name, customization: EMPTY_COLUMN_CUSTOMIZATION })) ?? [] };
    }

    public addCustomization(customization: DBManagerTypes.Customization<DBManagerSchema.TableName>) {
        const existingCustomization = this.customizations.find((c) => c.name === customization.name);
        if (existingCustomization) {
            console.log("Existing customization found", existingCustomization.columns.length);
            existingCustomization.customization = customization.customization;
        } else {
            const table = this.serverMounter.schemaDetails.tables.find((t) => t.name === customization.name);
            if (table) {
                table.columns.forEach((c) => {
                    customization.columns.push({ name: c.name, customization: EMPTY_COLUMN_CUSTOMIZATION });
                });
            }
            this.customizations.push(customization);
        }

        this.writeCustomizations();

        return this.getCustomization(customization.name as DBManagerSchema.TableName);
    }

    public addColumnCustomization(table: DBManagerSchema.TableName, column: string, customization: Partial<DBManagerTypes.CustomColumn>) {
        const existingCustomization = this.customizations.find((c) => c.name === table);
        if (existingCustomization) {
            const columnCustomization = existingCustomization.columns.find((c) => c.name === column);
            if (columnCustomization) {
                columnCustomization.customization = { ...columnCustomization.customization, ...customization };
            } else {
                existingCustomization.columns.push({ name: column, customization: { ...EMPTY_COLUMN_CUSTOMIZATION, ...customization } });
            }
        } else {
            const tableData = this.serverMounter.schemaDetails.tables.find((t) => t.name === table);
            const customizationData: DBManagerTypes.Customization<DBManagerSchema.TableName> = { name: table, columns: [], customization: EMPTY_TABLE_CUSTOMIZATION };
            if (tableData) {
                tableData.columns.forEach((c) => {
                    if (c.name === column) {
                        customizationData.columns.push({ name: c.name, customization: { ...EMPTY_COLUMN_CUSTOMIZATION, ...customization } });
                    } else {
                        customizationData.columns.push({ name: c.name, customization: EMPTY_COLUMN_CUSTOMIZATION });
                    }
                });
            }

            this.customizations.push(customizationData);
        }

        this.writeCustomizations();

        return this.getCustomization(table as DBManagerSchema.TableName);
    }

    private readCustomizations(): DBManagerTypes.Customization<DBManagerSchema.TableName>[] {
        const rootDir = path.resolve(require.main?.path || process.cwd());
        const filePath = path.join(rootDir, `../${CUSTOMIZATIONS_FILE_NAME}`);
        if (!fs.existsSync(filePath)) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify([], null, 2), "utf-8");
            return [] as DBManagerTypes.Customization<DBManagerSchema.TableName>[];
        }

        console.log("Reading:", filePath);
        const raw = fs.readFileSync(filePath, "utf-8");
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, JSON.stringify([], null, 2), "utf-8");
                return [] as DBManagerTypes.Customization<DBManagerSchema.TableName>[];
            }
            return parsed as DBManagerTypes.Customization<DBManagerSchema.TableName>[];
        } catch (e) {
            console.error("❌ Failed to parse customizations.json", e);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify([], null, 2), "utf-8");
            return [] as DBManagerTypes.Customization<DBManagerSchema.TableName>[];
        }
    }

    private writeCustomizations() {
        const rootDir = path.resolve(require.main?.path || process.cwd());
        const filePath = path.join(rootDir, `../${CUSTOMIZATIONS_FILE_NAME}`);
        console.log("Writing:", filePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(this.customizations, null, 2), "utf-8");
        this.fillCustomizationsIntoSchema();

        try {
            const result = generateDbManagerTypes(this.serverMounter.schemaDetails, {
                outDir: "../.admin",
                fileName: "types.ts",
                preferRequireMain: true,
                banner: "Derived from schemaDetails + customizations.json",
                customizations: this.customizations,
                skipIfUnchanged: true,
            });
            console.log(`Types ${result.written ? "written" : "up-to-date"}: ${result.filePath}`);
        } catch (e) {
            console.error("Failed to generate types.ts:", e);
        }
    }

    private fillCustomizationsIntoSchema() {
        this.serverMounter.schemaDetails.tables.forEach((table) => {
            const customization = this.getCustomization(table.name as DBManagerSchema.TableName);
            table.customization = customization.customization;
            table.columns.forEach((column) => {
                const columnCustomization = customization.columns.find((c) => c.name === column.name)!;
                column.customization = columnCustomization?.customization ?? EMPTY_COLUMN_CUSTOMIZATION;
            });
        });
    }
}