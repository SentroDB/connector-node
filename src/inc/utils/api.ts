import wretch from "wretch";
import type { QueryStringAddon as WretchQueryStringAddon } from "wretch/addons";
import QueryStringAddon from "wretch/addons/queryString";

declare module "wretch" {
    interface Wretch {
        post<TRes = unknown, TBody = unknown>(
            this: WretchQueryStringAddon &
                Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>,
            body?: TBody,
            // url?: string | undefined
        ): Promise<TRes>;
        get<TRes = unknown>(
            this: WretchQueryStringAddon &
                Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>,
            // url?: string | undefined
        ): Promise<TRes>;
        put<TRes = unknown, TBody = unknown>(
            this: WretchQueryStringAddon &
                Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>,
            body?: TBody,
            // url?: string | undefined
        ): Promise<TRes>;
        patch<TRes = unknown, TBody = unknown>(
            this: WretchQueryStringAddon &
                Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>,
            body?: TBody,
            // url?: string | undefined
        ): Promise<TRes>;
        delete<TRes = unknown>(
            this: WretchQueryStringAddon &
                Wretch<WretchQueryStringAddon, unknown, Promise<unknown>>,
            // url?: string | undefined
        ): Promise<TRes>;
    }
}

export const wretchApi = wretch().addon(QueryStringAddon)
    .options({ credentials: "include" })
    .headers({
        "Content-Type": "application/json",
    })
    .catcherFallback(async (err) => {
        throw err;
    })
    .resolve(async (resolver) => {
        return resolver.res(async (res) => {
            if (res.ok) {
                try {
                    return await resolver.json();
                } catch (error) {
                    try {
                        return await resolver.text();
                    } catch (error) {
                        return null;
                    }
                }
            }
            throw await resolver.json();
        });
    });
