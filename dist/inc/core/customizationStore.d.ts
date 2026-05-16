import { ColumnName } from "../types/modelCustomizer";
import DBManagerTypes from "@sentrodb/connector-node-types";
import type { WebhookConfig } from "../types/webhook";
export declare class CustomizationStore {
    #private;
    private customizations;
    private webhooks;
    private serverMounter;
    static get instance(): CustomizationStore;
    load(): void;
    private readFile;
    private writeFile;
    addCustomization(customization: DBManagerTypes.Customization<DBManagerSchema.TableName>): DBManagerTypes.Customization<string>;
    addColumnCustomization<T extends DBManagerSchema.TableName>(table: T, column: ColumnName<T>, customization: Partial<DBManagerTypes.CustomColumn>): DBManagerTypes.Customization<string>;
    getCustomization(modelName: DBManagerSchema.TableName): DBManagerTypes.Customization<DBManagerSchema.TableName>;
    getAll(): DBManagerTypes.Customization<DBManagerSchema.TableName>[];
    getWebhooks(): WebhookConfig[];
    setWebhooks(webhooks: WebhookConfig[]): void;
}
//# sourceMappingURL=customizationStore.d.ts.map