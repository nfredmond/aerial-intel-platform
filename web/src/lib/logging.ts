export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export type Logger = {
  readonly namespace: string;
  debug: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  child: (suffix: string, baseFields?: LogFields) => Logger;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const raw = typeof process !== "undefined" ? process.env?.AERIAL_LOG_LEVEL : undefined;
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env?.NODE_ENV === "test" ? "warn" : "info";
}

function safeSerialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = v instanceof Error ? safeSerialize(v) : v;
    }
    return out;
  }
  return value;
}

function emit(namespace: string, level: LogLevel, message: string, baseFields: LogFields, extra?: LogFields) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[resolveMinLevel()]) return;

  const record: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    namespace,
    message,
    ...baseFields,
    ...(extra ? { fields: Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, safeSerialize(v)])) } : {}),
  };

  const line = JSON.stringify(record);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function createLogger(namespace: string, baseFields: LogFields = {}): Logger {
  return {
    namespace,
    debug: (message, fields) => emit(namespace, "debug", message, baseFields, fields),
    info: (message, fields) => emit(namespace, "info", message, baseFields, fields),
    warn: (message, fields) => emit(namespace, "warn", message, baseFields, fields),
    error: (message, fields) => emit(namespace, "error", message, baseFields, fields),
    child: (suffix, childFields) =>
      createLogger(`${namespace}.${suffix}`, { ...baseFields, ...(childFields ?? {}) }),
  };
}

export function extractRequestId(request: { headers: Headers } | Headers | Request | null | undefined): string | null {
  if (!request) return null;
  const headers = request instanceof Headers
    ? request
    : "headers" in request
      ? request.headers
      : null;
  if (!headers) return null;
  return (
    headers.get("x-request-id")
    ?? headers.get("x-vercel-id")
    ?? headers.get("cf-ray")
    ?? null
  );
}
