import DBManagerTypes from "@sentrodb/connector-node-types";
export declare class TableCustomizer {
    private customizer;
    private customization;
    private modelName;
    constructor(modelName: DBManagerSchema.TableName);
    getCustomization(): DBManagerTypes.Customization<DBManagerSchema.TableName>;
    addCustomization(customization: DBManagerTypes.Customization<DBManagerSchema.TableName>): void;
    addColumnCustomization(column: string, customization: Partial<DBManagerTypes.CustomColumn>): void;
}
//# sourceMappingURL=tableCustomizer.d.ts.map