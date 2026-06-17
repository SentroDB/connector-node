
import DBManagerTypes, { DBConfig, SegmentCondition } from "@sentrodb/connector-node-types";

export type JunctionWriteSpec = {
    junctionTable: string;
    sourceColumn: string;
    targetColumn: string;
    parentSourceColumn: string;
    targetIds: any[];
};

export interface DatabaseHandler {
    connect: ({ config }: { config: DBConfig }) => Promise<void>;
    disconnect: () => Promise<void>;

    getSchemaDetails: () => Promise<DBManagerTypes.SchemaDetails>;

    get: ({ table, where, limit, offset, orderBy, orderDirection, search, searchColumns, columns, extraConditions }: { table: string, where?: any, limit?: number, offset?: number, orderBy?: string, orderDirection?: "asc" | "desc", search?: string, searchColumns?: string[], columns?: string[], extraConditions?: SegmentCondition[] }) => Promise<any>;
    getSingle: ({ table, where }: { table: DBManagerSchema.TableName, where?: { [key: string]: string } }) => Promise<any>;
    update: ({ table, data, where, junctions }: { table: DBManagerSchema.TableName, data: DBManagerSchema.UpdateBy<DBManagerSchema.TableName>['patch'], where: DBManagerSchema.UpdateBy<DBManagerSchema.TableName>['where'], junctions?: JunctionWriteSpec[] }) => Promise<any>;
    insert: ({ table, data, junctions }: { table: DBManagerSchema.TableName, data: DBManagerSchema.InsertBy<DBManagerSchema.TableName>, junctions?: JunctionWriteSpec[] }) => Promise<any>;
    delete: ({ table, where, single }: { table: DBManagerSchema.TableName, where: DBManagerSchema.DeleteBy<DBManagerSchema.TableName>['where'], single: DBManagerSchema.DeleteBy<DBManagerSchema.TableName>['single'] }) => Promise<any>;
    count: ({ table, where, search, searchColumns, extraConditions }: { table: DBManagerSchema.TableName, where?: any, search?: string, searchColumns?: string[], extraConditions?: SegmentCondition[] }) => Promise<any>;
    query: ({ sql, params, schema }: { sql: string, params?: any[], schema?: string }) => Promise<{ rows: any[], columns: string[] }>;
    getRelatedIds: ({ junctionTable, sourceColumn, sourceValue, targetColumn }: { junctionTable: string, sourceColumn: string, sourceValue: any, targetColumn: string }) => Promise<any[]>;
}
