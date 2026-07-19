import type { Filters, UserProgress } from "./algotop";
import type { GithubUser, LocalProfile } from "./account";
import type { UserNotes } from "./notes";

const SYNC_FILENAME = "algotop-sync.json";
const SYNC_DESCRIPTION = "AlgoTop Sync Data";

export const GIST_SYNC_STORAGE_KEY = "algotop:gist-sync:v1";

export type GistSyncMeta = {
  gistId?: string;
  gistUrl?: string;
  lastSyncedAt?: string;
};

export type AlgoTopSyncPayload = {
  schemaVersion: 1;
  app: "AlgoTop";
  exportedAt: string;
  user?: Pick<GithubUser, "id" | "login" | "avatarUrl" | "htmlUrl">;
  localProfile?: LocalProfile;
  progress: UserProgress;
  notes: UserNotes;
  preferences: {
    filters: Filters;
    theme: string;
  };
};

type GistFile = {
  filename: string;
  raw_url?: string;
  content?: string;
  truncated?: boolean;
};

type GistResponse = {
  id: string;
  html_url: string;
  files: Record<string, GistFile>;
};

export function readStoredGistSyncMeta(): GistSyncMeta {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(GIST_SYNC_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      gistId: typeof parsed.gistId === "string" ? parsed.gistId : undefined,
      gistUrl: typeof parsed.gistUrl === "string" ? parsed.gistUrl : undefined,
      lastSyncedAt:
        typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : undefined,
    };
  } catch {
    return {};
  }
}

export function writeStoredGistSyncMeta(meta: GistSyncMeta) {
  if (typeof window === "undefined") return;

  if (!meta.gistId && !meta.lastSyncedAt) {
    window.localStorage.removeItem(GIST_SYNC_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(GIST_SYNC_STORAGE_KEY, JSON.stringify(meta));
}

export function createSyncPayload({
  user,
  progress,
  notes,
  filters,
  theme,
  localProfile,
}: {
  user: GithubUser | null;
  progress: UserProgress;
  notes: UserNotes;
  filters: Filters;
  theme: string;
  localProfile?: LocalProfile;
}): AlgoTopSyncPayload {
  return {
    schemaVersion: 1,
    app: "AlgoTop",
    exportedAt: new Date().toISOString(),
    user: user
      ? {
          id: user.id,
          login: user.login,
          avatarUrl: user.avatarUrl,
          htmlUrl: user.htmlUrl,
        }
      : undefined,
    localProfile,
    progress,
    notes,
    preferences: {
      filters,
      theme,
    },
  };
}

async function githubRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub 请求失败：${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function findAlgoTopGist(token: string) {
  const gists = await githubRequest<GistResponse[]>(token, "/gists?per_page=100");
  return gists.find((gist) => gist.files[SYNC_FILENAME]);
}

export async function pushAlgoTopGist({
  token,
  gistId,
  payload,
}: {
  token: string;
  gistId?: string;
  payload: AlgoTopSyncPayload;
}) {
  const content = JSON.stringify(payload, null, 2);
  const body = JSON.stringify({
    description: SYNC_DESCRIPTION,
    public: false,
    files: {
      [SYNC_FILENAME]: {
        content,
      },
    },
  });
  const existingGistId = gistId || (await findAlgoTopGist(token))?.id;
  const gist = existingGistId
    ? await githubRequest<GistResponse>(token, `/gists/${existingGistId}`, {
        method: "PATCH",
        body,
      })
    : await githubRequest<GistResponse>(token, "/gists", {
        method: "POST",
        body,
      });

  return {
    gistId: gist.id,
    gistUrl: gist.html_url,
    lastSyncedAt: payload.exportedAt,
  } satisfies GistSyncMeta;
}

export async function pullAlgoTopGist(token: string, gistId?: string) {
  const gist = gistId
    ? await githubRequest<GistResponse>(token, `/gists/${gistId}`)
    : await findAlgoTopGist(token);

  if (!gist) {
    throw new Error("没有找到 AlgoTop 同步 Gist");
  }

  const file = gist.files[SYNC_FILENAME];
  if (!file) {
    throw new Error("同步文件不存在");
  }

  const content =
    file.content && !file.truncated
      ? file.content
      : file.raw_url
        ? await fetch(file.raw_url, {
            headers: { Authorization: `Bearer ${token}` },
          }).then((response) => response.text())
        : "";

  if (!content) {
    throw new Error("同步文件为空");
  }

  return {
    payload: JSON.parse(content) as AlgoTopSyncPayload,
    meta: {
      gistId: gist.id,
      gistUrl: gist.html_url,
      lastSyncedAt: new Date().toISOString(),
    } satisfies GistSyncMeta,
  };
}
