import { RowOf } from "../types/modelCustomizer";
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
    addColumnCustomization<K extends keyof RowOf<DBManagerSchema.TableName>>(table: DBManagerSchema.TableName, column: K, customization: Partial<DBManagerTypes.CustomColumn>): DBManagerTypes.Customization<string>;
    getCustomization(modelName: DBManagerSchema.TableName): DBManagerTypes.Customization<DBManagerSchema.TableName>;
    getAll(): DBManagerTypes.Customization<DBManagerSchema.TableName>[];
    getWebhooks(): WebhookConfig[];
    setWebhooks(webhooks: WebhookConfig[]): void;
}
//# sourceMappingURL=customizationStore.d.ts.map