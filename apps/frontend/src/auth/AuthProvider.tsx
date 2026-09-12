import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingState } from "../components/ui/PageStates";
import {
  apiRequest,
  setApiAccessToken,
  setApiRefreshHandler,
} from "../lib/api-client";
import {
  getDeviceIdentifier,
  getDeviceName,
  getRefreshToken,
  removeRefreshToken,
  saveRefreshToken,
} from "./auth-storage";
import type { AuthResponse, AuthUser, PendingConsentResponse, PendingTerm } from "./auth.types";

type LoginCredentials = {
  loginId: string;
  password: string;
};

type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  pendingTerms: PendingTerm[] | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<{ pendingConsent: boolean }>;
  consent: (agreedTermsDocumentIds: string[]) => Promise<void>;
  cancelPendingConsent: () => void;
  logout: () => Promise<void>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingTerms, setPendingTerms] = useState<PendingTerm[] | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshPromise = useRef<Promise<string | null> | null>(null);

  const clearSession = useCallback(() => {
    removeRefreshToken();
    setApiAccessToken(null);
    setUser(null);
    setPendingTerms(null);
  }, []);

  const applyAuthResponse = useCallback((response: AuthResponse): string => {
    saveRefreshToken(response.refreshToken);
    setApiAccessToken(response.accessToken);
    setUser({
      ...response.user,
      mustChangePassword: response.mustChangePassword,
    });
    setPendingTerms(null);

    return response.accessToken;
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (refreshPromise.current) {
      return refreshPromise.current;
    }

    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      clearSession();
      return null;
    }

    refreshPromise.current = apiRequest<AuthResponse>("/auth/refresh", {
      method: "POST",
      skipAuth: true,
      body: { refreshToken },
    })
      .then(applyAuthResponse)
      .catch(() => {
        clearSession();
        return null;
      })
      .finally(() => {
        refreshPromise.current = null;
      });

    return refreshPromise.current;
  }, [applyAuthResponse, clearSession]);

  useEffect(() => {
    let active = true;

    setApiRefreshHandler(refreshAccessToken);

    queueMicrotask(() => {
      void refreshAccessToken().finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    });

    return () => {
      active = false;
      setApiRefreshHandler(null);
    };
  }, [refreshAccessToken]);

  const login = async (credentials: LoginCredentials): Promise<{ pendingConsent: boolean }> => {
    const response = await apiRequest<AuthResponse | PendingConsentResponse>("/auth/login", {
      method: "POST",
      skipAuth: true,
      body: {
        loginId: credentials.loginId,
        password: credentials.password,
        deviceIdentifier: getDeviceIdentifier(),
        deviceName: getDeviceName(),
      },
    });

    if ("pendingConsent" in response) {
      setApiAccessToken(response.consentToken);
      setPendingTerms(response.pendingTerms);
      setUser(null);
      return { pendingConsent: true };
    }

    applyAuthResponse(response);
    return { pendingConsent: false };
  };

  const consent = async (agreedTermsDocumentIds: string[]): Promise<void> => {
    const response = await apiRequest<AuthResponse>("/auth/consent", {
      method: "POST",
      body: {
        agreedTermsDocumentIds,
        deviceIdentifier: getDeviceIdentifier(),
        deviceName: getDeviceName(),
      },
    });
    applyAuthResponse(response);
  };

  const logout = async (): Promise<void> => {
    const refreshToken = getRefreshToken();

    try {
      if (refreshToken) {
        await apiRequest<void>("/auth/logout", {
          method: "POST",
          skipAuth: true,
          body: { refreshToken },
        });
      }
    } finally {
      clearSession();
    }
  };

  const changePassword = async (input: ChangePasswordInput): Promise<void> => {
    await apiRequest<void>("/auth/change-password", {
      method: "POST",
      body: input,
    });

    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        pendingTerms,
        loading,
        login,
        consent,
        cancelPendingConsent: clearSession,
        logout,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// AuthProvider와 함께 사용하는 전용 Hook입니다.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth는 AuthProvider 내부에서 사용해야 합니다.");
  }

  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, pendingTerms, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="standalone-state">
        <LoadingState message="로그인 상태를 확인하고 있습니다." />
      </div>
    );
  }

  if (!user) {
    if (pendingTerms) {
      return <Navigate to="/consent" replace />;
    }
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (!user.mustChangePassword && location.pathname === "/change-password") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, pendingTerms, loading } = useAuth();

  if (loading) {
    return (
      <div className="standalone-state">
        <LoadingState message="로그인 상태를 확인하고 있습니다." />
      </div>
    );
  }

  if (user) {
    return (
      <Navigate
        to={user.mustChangePassword ? "/change-password" : "/dashboard"}
        replace
      />
    );
  }

  if (pendingTerms) {
    return <Navigate to="/consent" replace />;
  }

  return children;
}
