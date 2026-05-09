import type { ViewConfig, ViewWithTemplate } from "@sentrodb/connector-node-types";
export declare class ViewsStore {
    #private;
    static get instance(): ViewsStore;
    private get dir();
    private ensureDir;
    list(): ViewConfig[];
    get(slug: string): ViewWithTemplate | null;
    create(input: Omit<ViewConfig, "createdAt" | "updatedAt"> & {
        template: string;
    }): ViewWithTemplate;
    update(slug: string, patch: Partial<Omit<ViewConfig, "slug" | "createdAt">> & {
        template?: string;
    }): ViewWithTemplate;
    delete(slug: string): boolean;
    private readConfig;
    private writeConfig;
    private deleteConfig;
    private readTemplate;
    private writeTemplate;
    private deleteTemplate;
}
//# sourceMappingURL=viewsStore.d.ts.map