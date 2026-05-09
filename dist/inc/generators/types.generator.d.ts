import type { SchemaDetails, Customization } from "@sentrodb/connector-node-types";
type GenOpts = {
    /** Defaults to writing one directory up from require.main.path (next to your JSON). */
    outDir?: string;
    fileName?: string;
    preferRequireMain?: boolean;
    banner?: string;
    customizations?: Customization<DBManagerSchema.TableName>[];
    skipIfUnchanged?: boolean;
};
export declare function generateDbManagerTypes(schema: SchemaDetails, opts?: GenOpts): {
    filePath: string;
    written: boolean;
};
export {};
//# sourceMappingURL=types.generator.d.ts.map