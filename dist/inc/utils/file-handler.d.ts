import { ConnectorConfig } from "../types/global";
import DBManagerTypes from "@sentrodb/connector-node-types";
export declare const writeJsonToFile: (data: DBManagerTypes.SchemaDetails) => Promise<void>;
export declare const generateJson: (config: ConnectorConfig) => Promise<DBManagerTypes.SchemaDetails>;
export declare const findProjectRoot: (start?: string) => string;
//# sourceMappingURL=file-handler.d.ts.map