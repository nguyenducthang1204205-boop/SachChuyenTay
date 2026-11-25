import { API_VERSION_PREFIX, ERROR_CODES, type ErrorCode, type ProblemDetails } from "@sct/shared";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || API_VERSION_PREFIX).replace(/\/$/, "");
const DEFAULT_TIMEOUT_MS = 15_000;

/** Lỗi gọi API đã chuẩn hoá — UI chỉ cần xử lý một kiểu lỗi duy nhất. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ErrorCode | "NETWORK" | "TIMEOUT" | "ABORTED",
    readonly problem?: ProblemDetails
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNetwork() {
    return this.code === "NETWORK" || this.code === "TIMEOUT";
  }
}

export const isAbort = (err: unknown) => err instanceof ApiError && err.code === "ABORTED";

type QueryValue = string | number | boolean | readonly (string | number)[] | null | undefined;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else {
      params.set(key, value === true ? "1" : String(value));
    }
  }
  const qs = params.toString();
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ""}`;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  // Blob (ảnh…) gửi nguyên dạng nhị phân với Content-Type của nó; còn lại gửi JSON.
  const isBlob = body instanceof Blob;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      signal: combined,
      headers: {
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": isBlob ? body.type : "application/json" }),
        ...headers
      },
      body: isBlob ? body : body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    if (signal?.aborted) throw new ApiError("Yêu cầu đã bị huỷ.", 0, "ABORTED");
    if (timeout.aborted) throw new ApiError("Máy chủ phản hồi quá lâu. Vui lòng thử lại.", 0, "TIMEOUT");
    throw new ApiError("Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.", 0, "NETWORK");
  }

  if (res.status === 204) return undefined as T;

  const isJson = /json/.test(res.headers.get("content-type") ?? "");
  const payload: unknown = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const problem = payload as ProblemDetails | null;
    throw new ApiError(
      problem?.detail || problem?.title || `Lỗi máy chủ (${res.status})`,
      res.status,
      problem?.code ?? (res.status >= 500 ? ERROR_CODES.INTERNAL : ERROR_CODES.VALIDATION_FAILED),
      problem ?? undefined
    );
  }
  return payload as T;
}
