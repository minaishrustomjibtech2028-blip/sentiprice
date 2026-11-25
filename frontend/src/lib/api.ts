import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const ACCESS_TOKEN_KEY = "sentiprice_access_token";
const REFRESH_TOKEN_KEY = "sentiprice_refresh_token";

/** Turns a stored relative image path (e.g. "/media/products/x.png") into a loadable URL. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:\/\//i.test(path) ? path : `${API_BASE_URL}${path}`;
}

export const SESSION_EXPIRED_EVENT = "sentiprice:session-expired";

export const tokenStorage = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setTokens: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },
  setAccessToken: (accessToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
});

// Attach the access token to every outgoing request.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On a 401, try exactly one silent refresh-and-retry before giving up.
// This keeps a logged-in session alive across access-token expiry
// without the user noticing, while avoiding infinite retry loops.
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    // A wrong password on /auth/login is also a 401 — that's not an expired session.
    const isAuthForm = /\/auth\/(login|register)/.test(originalRequest.url ?? "");
    if (isAuthForm) return Promise.reject(error);

    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) {
      if (tokenStorage.getAccessToken()) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      tokenStorage.clear();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push((newToken) => {
          if (!newToken) return reject(error);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(api(originalRequest));
        });
      });
    }

    isRefreshing = true;
    try {
      const { data } = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
        refresh_token: refreshToken,
      });
      tokenStorage.setAccessToken(data.access_token);
      pendingQueue.forEach((cb) => cb(data.access_token));
      pendingQueue = [];
      originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      return api(originalRequest);
    } catch (refreshError) {
      pendingQueue.forEach((cb) => cb(null));
      pendingQueue = [];
      tokenStorage.clear();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
