import { isIP } from "node:net";

type HeaderValue = string | string[] | undefined;

type RequestLike = {
  headers?: Record<string, HeaderValue>;
  ip?: string;
  socket?: {
    remoteAddress?: string | null;
  };
};

const takeFirstHeaderValue = (value: HeaderValue): string | null => {
  if (Array.isArray(value)) {
    return takeFirstHeaderValue(value[0]);
  }

  if (typeof value !== "string") {
    return null;
  }

  const first = value.split(",")[0]?.trim();
  return first ? first : null;
};

export const normalizeIpAddress = (
  value: string | null | undefined,
): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("::ffff:")) {
    return normalizeIpAddress(trimmed.slice("::ffff:".length));
  }

  if (trimmed.startsWith("[")) {
    const bracketMatch = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
    if (bracketMatch) {
      return normalizeIpAddress(bracketMatch[1]);
    }
  }

  const ipv4WithPortMatch = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4WithPortMatch) {
    return normalizeIpAddress(ipv4WithPortMatch[1]);
  }

  if (isIP(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
};

export const getRequestIp = (request: RequestLike): string | null => {
  const forwardedIp = takeFirstHeaderValue(request.headers?.["x-forwarded-for"]);
  const realIp = takeFirstHeaderValue(request.headers?.["x-real-ip"]);

  return (
    normalizeIpAddress(forwardedIp) ??
    normalizeIpAddress(realIp) ??
    normalizeIpAddress(request.ip) ??
    normalizeIpAddress(request.socket?.remoteAddress ?? null)
  );
};

export const isIpAllowed = (
  requestIp: string | null | undefined,
  allowedIps: string[] | undefined,
): boolean => {
  const normalizedRequestIp = normalizeIpAddress(requestIp);
  if (!normalizedRequestIp || !allowedIps?.length) {
    return false;
  }

  return allowedIps.some(
    (allowedIp) => normalizeIpAddress(allowedIp) === normalizedRequestIp,
  );
};
