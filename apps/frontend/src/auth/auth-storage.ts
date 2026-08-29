const REFRESH_TOKEN_KEY = "lms.refresh-token";
const DEVICE_IDENTIFIER_KEY = "lms.device-identifier";

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveRefreshToken(refreshToken: string): void {
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function removeRefreshToken(): void {
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getDeviceIdentifier(): string {
  const current = localStorage.getItem(DEVICE_IDENTIFIER_KEY);

  if (current) {
    return current;
  }

  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_IDENTIFIER_KEY, created);

  return created;
}

export function getDeviceName(): string {
  const platform = navigator.platform || "Unknown";
  return `${platform} 웹 브라우저`.slice(0, 150);
}
