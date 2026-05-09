import DBManagerTypes from "@sentrodb/connector-node-types";
export declare class Customizer {
    #private;
    private serverMounter;
    private customizations;
    static get instance(): Customizer;
    constructor();
    getCustomization(modelName: DBManagerSchema.TableName): DBManagerTypes.Customization<DBManagerSchema.TableName>;
    addCustomization(customization: DBManagerTypes.Customization<DBManagerSchema.TableName>): DBManagerTypes.Customization<string>;
    addColumnCustomization(table: DBManagerSchema.TableName, column: string, customization: Partial<DBManagerTypes.CustomColumn>): DBManagerTypes.Customization<string>;
    private readCustomizations;
    private writeCustomizations;
    private fillCustomizationsIntoSchema;
}
//# sourceMappingURL=customizer.d.ts.map