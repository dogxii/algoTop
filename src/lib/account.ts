export const GITHUB_USER_STORAGE_KEY = "algotop:github-user:v1";
export const GITHUB_TOKEN_STORAGE_KEY = "algotop:github-token:v1";
export const LOCAL_PROFILE_STORAGE_KEY = "algotop:local-profile:v1";

const GITHUB_AUTH_SESSION_KEY = "algotop:github-auth-session:v1";

export type GithubUser = {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  connectedAt: string;
};

export type LocalProfile = {
  name: string;
  avatarUrl: string;
  updatedAt?: string;
};

export type GithubOAuthConfig = {
  clientId: string;
  tokenEndpoint: string;
  redirectUri: string;
};

type GithubApiUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
};

type GithubAuthSession = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: string;
};

type TokenExchangeResponse = {
  access_token?: string;
  accessToken?: string;
  error?: string;
  message?: string;
  user?: GithubApiUser;
};

export const DEFAULT_LOCAL_PROFILE: LocalProfile = {
  name: "本地用户",
  avatarUrl: "",
};

export function getGithubOAuthConfig(): GithubOAuthConfig | null {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
  const tokenEndpoint =
    import.meta.env.VITE_GITHUB_TOKEN_ENDPOINT || "/api/github/oauth";

  if (!clientId) return null;

  return {
    clientId,
    tokenEndpoint,
    redirectUri: `${window.location.origin}${window.location.pathname}`,
  };
}

export function readStoredLocalProfile(): LocalProfile {
  if (typeof window === "undefined") return DEFAULT_LOCAL_PROFILE;

  try {
    const raw = window.localStorage.getItem(LOCAL_PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL_PROFILE;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      name:
        typeof parsed.name === "string" && parsed.name.trim()
          ? parsed.name
          : DEFAULT_LOCAL_PROFILE.name,
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : "",
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };
  } catch {
    return DEFAULT_LOCAL_PROFILE;
  }
}

export function writeStoredLocalProfile(profile: LocalProfile) {
  if (typeof window === "undefined") return;

  const normalized: LocalProfile = {
    name: profile.name.trim() || DEFAULT_LOCAL_PROFILE.name,
    avatarUrl: profile.avatarUrl.trim(),
    updatedAt: profile.updatedAt,
  };

  if (
    normalized.name === DEFAULT_LOCAL_PROFILE.name &&
    !normalized.avatarUrl &&
    !normalized.updatedAt
  ) {
    window.localStorage.removeItem(LOCAL_PROFILE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(LOCAL_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
}

export function readStoredGithubUser(): GithubUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(GITHUB_USER_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.id !== "number" ||
      typeof parsed.login !== "string" ||
      typeof parsed.avatarUrl !== "string" ||
      typeof parsed.htmlUrl !== "string"
    ) {
      return null;
    }

    return {
      id: parsed.id,
      login: parsed.login,
      name: typeof parsed.name === "string" ? parsed.name : null,
      avatarUrl: parsed.avatarUrl,
      htmlUrl: parsed.htmlUrl,
      connectedAt:
        typeof parsed.connectedAt === "string"
          ? parsed.connectedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeStoredGithubUser(user: GithubUser | null) {
  if (typeof window === "undefined") return;

  if (!user) {
    window.localStorage.removeItem(GITHUB_USER_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(GITHUB_USER_STORAGE_KEY, JSON.stringify(user));
}

export function readStoredGithubToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) ?? "";
}

export function writeStoredGithubToken(token: string) {
  if (typeof window === "undefined") return;

  if (!token) {
    window.localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, token);
}

function toGithubUser(user: GithubApiUser): GithubUser {
  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
    htmlUrl: user.html_url,
    connectedAt: new Date().toISOString(),
  };
}

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let value = "";

  data.forEach((byte) => {
    value += String.fromCharCode(byte);
  });

  return window
    .btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function sha256Base64Url(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  return base64Url(digest);
}

async function readTokenExchangeResponse(response: Response) {
  try {
    return (await response.json()) as TokenExchangeResponse;
  } catch {
    return {} satisfies TokenExchangeResponse;
  }
}

export async function startGithubOAuthLogin(config: GithubOAuthConfig) {
  const state = randomToken(24);
  const codeVerifier = randomToken(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const session: GithubAuthSession = {
    state,
    codeVerifier,
    redirectUri: config.redirectUri,
    createdAt: new Date().toISOString(),
  };
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "gist",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  window.sessionStorage.setItem(GITHUB_AUTH_SESSION_KEY, JSON.stringify(session));
  window.location.assign(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

export function readGithubOAuthCallback() {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  if (!code && !error) return null;
  return { code, state, error };
}

export function clearGithubOAuthCallbackUrl() {
  const url = new URL(window.location.href);
  ["code", "state", "error", "error_description", "error_uri"].forEach((key) => {
    url.searchParams.delete(key);
  });

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function readAuthSession(state: string | null) {
  const raw = window.sessionStorage.getItem(GITHUB_AUTH_SESSION_KEY);
  if (!raw) throw new Error("登录状态已失效");

  const session = JSON.parse(raw) as GithubAuthSession;
  if (!state || session.state !== state) {
    throw new Error("GitHub 登录状态不匹配");
  }

  return session;
}

export async function completeGithubOAuthLogin(config: GithubOAuthConfig) {
  const callback = readGithubOAuthCallback();
  if (!callback) return null;
  if (callback.error) throw new Error("GitHub 登录已取消");
  if (!callback.code) throw new Error("缺少 GitHub 登录授权码");

  const session = readAuthSession(callback.state);
  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: callback.code,
      codeVerifier: session.codeVerifier,
      redirectUri: session.redirectUri,
    }),
  });

  const data = await readTokenExchangeResponse(response);

  if (!response.ok) {
    const detail = data.message || data.error;
    throw new Error(
      detail ? `GitHub OAuth 换取 Token 失败：${detail}` : "GitHub OAuth 换取 Token 失败",
    );
  }

  const token = data.access_token ?? data.accessToken;
  if (!token) throw new Error("GitHub OAuth 没有返回 Token");

  const user = data.user ? toGithubUser(data.user) : await fetchAuthenticatedGithubUser(token);
  window.sessionStorage.removeItem(GITHUB_AUTH_SESSION_KEY);

  return { token, user };
}

export async function fetchAuthenticatedGithubUser(token: string): Promise<GithubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "GitHub 登录已过期"
        : `GitHub 连接失败：${response.status}`,
    );
  }

  const user = (await response.json()) as GithubApiUser;
  return toGithubUser(user);
}
