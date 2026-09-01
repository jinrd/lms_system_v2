import { getFrontendEnvironment } from "../env";

type ApiErrorBody = {
  success?: false;
  status?: number;
  code?: string;
  message?: string;
  request_id?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, body?: ApiErrorBody) {
    super(body?.message ?? "요청을 처리하지 못했습니다.");
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code ?? "UNKNOWN_ERROR";
    this.requestId = body?.request_id;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  skipAuth?: boolean;
};

let accessToken: string | null = null;
let refreshHandler: (() => Promise<string | null>) | null = null;

export function setApiAccessToken(token: string | null): void {
  accessToken = token;
}

export function setApiRefreshHandler(
  handler: (() => Promise<string | null>) | null,
): void {
  refreshHandler = handler;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  return executeRequest<T>(path, options, false);
}

async function executeRequest<T>(
  path: string,
  options: RequestOptions,
  retried: boolean,
): Promise<T> {
  const { apiBaseUrl } = getFrontendEnvironment();
  const { body, skipAuth = false, ...requestInit } = options;
  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (!skipAuth && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...requestInit,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && !skipAuth && !retried && refreshHandler) {
    const refreshedAccessToken = await refreshHandler();

    if (refreshedAccessToken) {
      return executeRequest<T>(path, options, true);
    }
  }

  if (!response.ok) {
    let errorBody: ApiErrorBody | undefined;

    try {
      errorBody = (await response.json()) as ApiErrorBody;
    } catch {
      errorBody = undefined;
    }

    throw new ApiError(response.status, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const responseText = await response.text();

  if (responseText.length === 0) {
    return null as T;
  }

  return JSON.parse(responseText) as T;
}
