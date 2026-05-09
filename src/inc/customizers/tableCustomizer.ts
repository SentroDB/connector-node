import DBManagerTypes from "@sentrodb/connector-node-types";
import { Customizer } from "./customizer";

export class TableCustomizer {
    private customizer: Customizer;
    private customization: DBManagerTypes.Customization<DBManagerSchema.TableName>;
    private modelName: DBManagerSchema.TableName;

    constructor(modelName: DBManagerSchema.TableName) {
        this.modelName = modelName;
        this.customizer = Customizer.instance;
        this.customization = this.customizer.getCustomization(this.modelName);
    }

    public getCustomization(): DBManagerTypes.Customization<DBManagerSchema.TableName> {
        return this.customization;
    }

    public addCustomization(customization: DBManagerTypes.Customization<DBManagerSchema.TableName>) {
        this.customization = this.customizer.addCustomization(customization);
    }

    public addColumnCustomization(column: string, customization: Partial<DBManagerTypes.CustomColumn>) {
        this.customization = this.customizer.addColumnCustomization(this.modelName, column, customization);
    }
}