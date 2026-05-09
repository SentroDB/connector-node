import { Context } from "koa";
import { TableCustomizer } from "../customizers/tableCustomizer";
import { Route } from "../types/global";
import type DBManagerTypes from "@sentrodb/connector-node-types";
import { CustomColumn } from "@sentrodb/connector-node-types";
import { HookEngine } from "../services/hook-engine";
export declare abstract class BaseDynamicModelRoutes {
    baseModelName: DBManagerSchema.TableName;
    hooks: HookEngine;
    customizer: TableCustomizer;
    private _columnNames?;
    private _columnsCache?;
    constructor(baseModelName: DBManagerSchema.TableName);
    getModelPath(): string;
    getSubPath(subPath: string): string;
    protected getSchemaTable(): DBManagerTypes.Table;
    protected getColumnNames(): Set<string>;
    getColumns(): DBManagerTypes.Column[];
}
export declare class DynamicModelRoute extends BaseDynamicModelRoutes {
    constructor(model: DBManagerSchema.TableName);
    getData(ctx: Context): Promise<import("../types/modelCustomizer").ListOf<string>>;
    getSingleData(ctx: Context): Promise<any>;
    addTableCustomization(ctx: Context): Promise<{
        rename: string;
        icon?: string;
        allowCreate: boolean;
        allowEdit: boolean;
        allowDelete: boolean;
        isVisible: boolean;
        allowExport: boolean;
        displayFields?: Array<{
            name: string;
            callback: (record: any) => any;
        }>;
        tableActions?: Array<{
            id: string;
            label: string;
            segmentId?: string;
        }>;
        recordActions?: Array<{
            id: string;
            label: string;
            segmentId?: string;
        }>;
        segments?: DBManagerTypes.Segment[];
    } | {
        error: string;
    }>;
    addColumnCustomization(ctx: Context): Promise<{
        column: string;
        customization: Partial<CustomColumn>;
    } | {
        error: string;
    }>;
    insert(ctx: Context): Promise<{
        pending: true;
        requestId: string;
        policyId: string;
        status: string;
    } | DBManagerSchema.RowBy<TN>[]>;
    delete(ctx: Context): Promise<{
        pending: true;
        requestId: string;
        policyId: string;
        status: string;
    } | DBManagerSchema.RowBy<TN>[] | {
        error: string;
    }>;
    update(ctx: Context): Promise<{
        pending: true;
        requestId: string;
        policyId: string;
        status: string;
    } | DBManagerSchema.RowBy<TN>[]>;
    callTableAction(ctx: Context): Promise<{
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: unknown;
    }>;
    callRecordAction(ctx: Context): Promise<{
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: unknown;
    }>;
    /**
     * Resolve a segment id from a `segment` query/body slug by consulting the
     * customization store. Returns undefined when no matching segment exists.
     */
    protected resolveSegmentIdFromQuery(ctx: Context): string | undefined;
    getRoutes(): Route[];
}
//# sourceMappingURL=BaseDynamicRoute.d.ts.map