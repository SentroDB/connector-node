import { IncomingMessage, ServerResponse } from "http";
import { Context } from "koa";

export type ConnectorConfig = {
    secretKey: string;
    authKey?: string;
    db: DBConfig;
    apiUrl?: string;
}

export type DBConfig = {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    schema?: string;
    type: 'postgres' | 'mysql' | 'mssql';
}

export type HttpCallback = (req: IncomingMessage, res: ServerResponse) => void;

export type Route = {
    path: string;
    method: 'get' | 'post' | 'put' | 'delete' | 'patch';
    callback: (ctx: Context) => any;
}

export type GetDataBody = {
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: "asc" | "desc";
    search?: string;
    searchColumns?: string[];
    where?: Record<string, unknown>;
    columns?: string[];
};

export type AsArray<R> = R extends any[] ? R : R[];

export interface IIntegrationRegistry {
    register<T>(id: string, integration: T): void;
    get<T>(id: string): T | undefined;
    has(id: string): boolean;
    remove(id: string): boolean;
    clear(): void;
    getAllIds(): string[];
}