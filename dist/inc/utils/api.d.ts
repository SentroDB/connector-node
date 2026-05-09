import type { QueryStringAddon as WretchQueryStringAddon } from "wretch/addons";
declare module "wretch" {
    interface Wretch {
        post<TRes = unknown, TBody = unknown>(this: WretchQueryStringAddon & Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>, body?: TBody): Promise<TRes>;
        get<TRes = unknown>(this: WretchQueryStringAddon & Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>): Promise<TRes>;
        put<TRes = unknown, TBody = unknown>(this: WretchQueryStringAddon & Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>, body?: TBody): Promise<TRes>;
        patch<TRes = unknown, TBody = unknown>(this: WretchQueryStringAddon & Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>, body?: TBody): Promise<TRes>;
        delete<TRes = unknown>(this: WretchQueryStringAddon & Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>): Promise<TRes>;
    }
}
export declare const wretchApi: WretchQueryStringAddon & import("wretch").Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>;
//# sourceMappingURL=api.d.ts.map