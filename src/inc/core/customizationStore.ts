import type { CustomTable, CustomColumn } from "@sentrodb/connector-node-types";
import { ColumnName } from "../types/modelCustomizer";
import DBManagerTypes from "@sentrodb/connector-node-types";
import {
  CUSTOMIZATIONS_FILE_NAME,
  EMPTY_COLUMN_CUSTOMIZATION,
  EMPTY_TABLE_CUSTOMIZATION,
} from "../utils/constants";
import path from "path";
import fs from "graceful-fs";
import { generateDbManagerTypes } from "../generators/types.generator";
import ServerMounter from "./serverMounter";
import { findProjectRoot } from "../utils/file-handler";
import type { WebhookConfig } from "../types/webhook";

type StoreShape = {
  tables: Record<DBManagerSchema.TableName, Partial<CustomTable>>;
  columns: {
    [T in DBManagerSchema.TableName]?: Record<
      ColumnName<T>,
      Partial<CustomColumn>
    >;
  };
};

/** On-disk format for customizations.json */
type FileShape = {
  customizations: DBManagerTypes.Customization<DBManagerSchema.TableName>[];
  webhooks: WebhookConfig[];
};

export class CustomizationStore {
  static #CustomizationStore: CustomizationStore;
  private customizations: DBManagerTypes.Customization<DBManagerSchema.TableName>[] =
    [];
  private webhooks: WebhookConfig[] = [];
  private serverMounter: ServerMounter = ServerMounter.instance;

  static get instance() {
    if (!this.#CustomizationStore) {
      this.#CustomizationStore = new CustomizationStore();
    }
    return this.#CustomizationStore;
  }

  public load() {
    const data = this.readFile();
    this.customizations = data.customizations;
    this.webhooks = data.webhooks;
  }

  private readFile(): FileShape {
    const rootDir = findProjectRoot();
    const filePath = path.join(rootDir, CUSTOMIZATIONS_FILE_NAME);

    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({ customizations: [], webhooks: [] }, null, 2),
        "utf-8"
      );
      return { customizations: [], webhooks: [] };
    }

    console.log("Reading:", filePath);
    const raw = fs.readFileSync(filePath, "utf-8");

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
    } catch (e) {
      console.error("Failed to parse " + CUSTOMIZATIONS_FILE_NAME, e);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({ customizations: [], webhooks: [] }, null, 2),
        "utf-8"
      );
      return { customizations: [], webhooks: [] };
    }
  }

  private writeFile() {
    const rootDir = findProjectRoot();
    const filePath = path.join(rootDir, CUSTOMIZATIONS_FILE_NAME);
    console.log("Writing:", filePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const data: FileShape = {
      customizations: this.customizations,
      webhooks: this.webhooks,
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");

    try {
      const result = generateDbManagerTypes(
        ServerMounter.instance.schemaDetails,
        {
          outDir: "../.admin",
          fileName: "types.ts",
          preferRequireMain: true,
          banner: "Derived from schemaDetails + customizations.json",
          customizations: this.customizations,
          skipIfUnchanged: true,
        }
      );
      console.log(
        `Types ${result.written ? "written" : "up-to-date"}: ${result.filePath}`
      );
    } catch (e) {
      console.error("Failed to generate types.ts:", e);
    }
  }

  // ─── Customizations ───

  public addCustomization(
    customization: DBManagerTypes.Customization<DBManagerSchema.TableName>
  ) {
    const existingCustomization = this.customizations.find(
      (c) => c.name === customization.name
    );
    if (existingCustomization) {
      console.log(
        "Existing customization found",
        existingCustomization.columns.length
      );
      existingCustomization.customization = customization.customization;
    } else {
      const table = this.serverMounter.schemaDetails.tables.find(
        (t) => t.name === customization.name
      );
      if (table) {
        table.columns.forEach((c) => {
          customization.columns.push({
            name: c.name,
            customization: EMPTY_COLUMN_CUSTOMIZATION,
          });
        });
      }
      this.customizations.push(customization);
    }

    this.writeFile();

    return this.getCustomization(
      customization.name as DBManagerSchema.TableName
    );
  }

  public addColumnCustomization<T extends DBManagerSchema.TableName>(
    table: T,
    column: ColumnName<T>,
    customization: Partial<DBManagerTypes.CustomColumn>
  ) {
    const existingCustomization = this.customizations.find(
      (c) => c.name === table
    );
    if (existingCustomization) {
      const columnCustomization = existingCustomization.columns.find(
        (c) => c.name === column
      );
      if (columnCustomization) {
        columnCustomization.customization = {
          ...columnCustomization.customization,
          ...customization,
        };
      } else {
        existingCustomization.columns.push({
          name: column,
          customization: { ...EMPTY_COLUMN_CUSTOMIZATION, ...customization },
        });
      }
    } else {
      const tableData = this.serverMounter.schemaDetails.tables.find(
        (t) => t.name === table
      );
      const customizationData: DBManagerTypes.Customization<DBManagerSchema.TableName> =
        { name: table, columns: [], customization: EMPTY_TABLE_CUSTOMIZATION };
      if (tableData) {
        tableData.columns.forEach((c) => {
          if (c.name === column) {
            customizationData.columns.push({
              name: c.name,
              customization: {
                ...EMPTY_COLUMN_CUSTOMIZATION,
                ...customization,
              },
            });
          } else {
            customizationData.columns.push({
              name: c.name,
              customization: EMPTY_COLUMN_CUSTOMIZATION,
            });
          }
        });
      }

      this.customizations.push(customizationData);
    }

    this.writeFile();

    return this.getCustomization(table as DBManagerSchema.TableName);
  }

  public getCustomization(
    modelName: DBManagerSchema.TableName
  ): DBManagerTypes.Customization<DBManagerSchema.TableName> {
    return (
      this.customizations.find((c) => c.name === modelName) ?? {
        name: modelName,
        customization: EMPTY_TABLE_CUSTOMIZATION,
        columns:
          this.serverMounter.schemaDetails.tables
            .find((t) => t.name === modelName)
            ?.columns.map((c) => ({
              name: c.name,
              customization: EMPTY_COLUMN_CUSTOMIZATION,
            })) ?? [],
      }
    );
  }

  public getAll(): DBManagerTypes.Customization<DBManagerSchema.TableName>[] {
    return this.customizations;
  }

  // ─── Webhooks ───

  public getWebhooks(): WebhookConfig[] {
    return this.webhooks;
  }

  public setWebhooks(webhooks: WebhookConfig[]): void {
    this.webhooks = webhooks;
    this.writeFile();
  }
}
