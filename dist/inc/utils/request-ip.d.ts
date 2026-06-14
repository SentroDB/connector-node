type HeaderValue = string | string[] | undefined;
type RequestLike = {
    headers?: Record<string, HeaderValue>;
    ip?: string;
    socket?: {
        remoteAddress?: string | null;
    };
};
export declare const normalizeIpAddress: (value: string | null | undefined) => string | null;
export declare const getRequestIp: (request: RequestLike) => string | null;
export declare const isIpAllowed: (requestIp: string | null | undefined, allowedIps: string[] | undefined) => boolean;
export {};
//# sourceMappingURL=request-ip.d.ts.map