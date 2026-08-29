export type FrontendEnvironment = {
  apiBaseUrl: string;
};

function requireHttpUrl(name: string, value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`${name} 환경변수가 올바른 URL이 아닙니다.`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`${name} 환경변수는 HTTP 또는 HTTPS URL이어야 합니다.`);
  }

  return value.replace(/\/+$/, "");
}

export function getFrontendEnvironment(): FrontendEnvironment {
  return {
    apiBaseUrl: requireHttpUrl(
      "VITE_API_BASE_URL",
      import.meta.env.VITE_API_BASE_URL,
    ),
  };
}
