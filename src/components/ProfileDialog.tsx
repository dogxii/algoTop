import {
  CheckCircle2,
  CircleUserRound,
  Cloud,
  Download,
  FileText,
  Github,
  ImageDown,
  LogOut,
  UploadCloud,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import type { GithubUser, LocalProfile } from "../lib/account";

type ProgressStats = {
  doneCount: number;
};

type ProfileDialogProps = {
  user: GithubUser | null;
  localProfile: LocalProfile;
  stats: ProgressStats;
  noteCount: number;
  activityDays: Array<{ date: string; count: number }>;
  gistUrl?: string;
  lastSyncedAt?: string;
  syncMessage: string;
  isSyncing: boolean;
  onClose: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onLocalProfileChange: (profile: LocalProfile) => void;
  onExportNotes: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void | Promise<void>;
  onPushSync: () => void;
  onPullSync: () => void;
};

function formatTime(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return window.Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getSyncStatus(lastSyncedAt: string | undefined, syncMessage: string) {
  const syncedAt = formatTime(lastSyncedAt);
  if (syncedAt) return syncedAt;
  return syncMessage;
}

function formatDay(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return window.Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function addRoundedRectPath(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(safeRadius, 0);
  context.lineTo(width - safeRadius, 0);
  context.quadraticCurveTo(width, 0, width, safeRadius);
  context.lineTo(width, height - safeRadius);
  context.quadraticCurveTo(width, height, width - safeRadius, height);
  context.lineTo(safeRadius, height);
  context.quadraticCurveTo(0, height, 0, height - safeRadius);
  context.lineTo(0, safeRadius);
  context.quadraticCurveTo(0, 0, safeRadius, 0);
  context.closePath();
}

function roundImageDataUrl(dataUrl: string, radius: number) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();

    image.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("图片导出失败"));
        return;
      }

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      addRoundedRectPath(context, canvas.width, canvas.height, radius);
      context.clip();
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    });
    image.addEventListener("error", () => reject(new Error("图片导出失败")));
    image.src = dataUrl;
  });
}

function makeAvatarDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.addEventListener("load", () => {
      const size = 320;
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = Math.max(0, Math.floor((image.naturalWidth - sourceSize) / 2));
      const sourceY = Math.max(0, Math.floor((image.naturalHeight - sourceSize) / 2));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      URL.revokeObjectURL(objectUrl);
      if (!context || sourceSize <= 0) {
        reject(new Error("头像读取失败"));
        return;
      }

      canvas.width = size;
      canvas.height = size;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, size, size);
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("头像读取失败"));
    });
    image.src = objectUrl;
  });
}

export function ProfileDialog({
  user,
  localProfile,
  stats,
  noteCount,
  activityDays,
  gistUrl,
  lastSyncedAt,
  syncMessage,
  isSyncing,
  onClose,
  onLogin,
  onLogout,
  onLocalProfileChange,
  onExportNotes,
  onExportBackup,
  onImportBackup,
  onPushSync,
  onPullSync,
}: ProfileDialogProps) {
  const shareRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const activityTotal = activityDays.reduce((total, item) => total + item.count, 0);
  const localName = localProfile.name.trim() || "本地用户";
  const localAvatar = localProfile.avatarUrl.trim();
  const localNameInputValue = localName === "本地用户" ? "" : localProfile.name;
  const activityStart = activityDays[0]?.date;
  const activityMiddle = activityDays[Math.floor(activityDays.length / 2)]?.date;
  const activityEnd = activityDays[activityDays.length - 1]?.date;
  const syncStatus = getSyncStatus(lastSyncedAt, syncMessage);

  async function exportProfileImage() {
    if (!shareRef.current || isExportingImage) return;

    const target = shareRef.current;
    setIsExportingImage(true);
    try {
      const { toPng } = await import("html-to-image");
      const rect = target.getBoundingClientRect();
      const width = Math.ceil(Math.max(rect.width, target.scrollWidth));
      const height = Math.ceil(Math.max(rect.height, target.scrollHeight));
      const computedStyle = window.getComputedStyle(target);
      const radius = Number.parseFloat(computedStyle.borderRadius) || 0;
      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        width,
        height,
        backgroundColor: computedStyle.backgroundColor,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          maxHeight: "none",
          overflow: "hidden",
          borderRadius: `${radius}px`,
        },
      });
      const roundedDataUrl = await roundImageDataUrl(dataUrl, radius * 2);

      downloadDataUrl(roundedDataUrl, `algotop-record-${new Date().toISOString().slice(0, 10)}.png`);
    } finally {
      setIsExportingImage(false);
    }
  }

  async function updateLocalAvatar(file?: File) {
    if (!file || !file.type.startsWith("image/")) return;

    const avatarUrl = await makeAvatarDataUrl(file);
    onLocalProfileChange({
      ...localProfile,
      avatarUrl,
    });
  }

  return (
    <div
      className="profile-modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="profile-dialog" aria-label="我的" role="dialog" aria-modal="true">
        <button
          className="editor-icon-button profile-dialog-close"
          type="button"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          <X size={16} strokeWidth={1.8} />
        </button>

        <div className="profile-dialog-body">
          <div className="profile-share-card" ref={shareRef}>
            <div className="profile-hero">
              {user ? (
                <a className="profile-person" href={user.htmlUrl} target="_blank" rel="noreferrer">
                  <img src={user.avatarUrl} alt="" />
                  <span>
                    <strong>{user.name || user.login}</strong>
                    <small>@{user.login}</small>
                  </span>
                </a>
              ) : (
                <div className="profile-person">
                  {localAvatar ? (
                    <img src={localAvatar} alt="" />
                  ) : (
                    <span className="profile-local-avatar">
                      <CircleUserRound size={32} strokeWidth={1.5} />
                    </span>
                  )}
                  <span>
                    <strong>{localName}</strong>
                  </span>
                </div>
              )}

            </div>

            <div className="profile-number-grid">
              <div>
                <CheckCircle2 size={18} strokeWidth={1.8} />
                <span>已做</span>
                <strong>{stats.doneCount}</strong>
              </div>
              <div>
                <FileText size={18} strokeWidth={1.8} />
                <span>笔记</span>
                <strong>{noteCount}</strong>
              </div>
            </div>

            <section className="profile-activity">
              <div className="profile-section-title">
                <span>活动</span>
                <small>{activityTotal}</small>
              </div>
              <div>
                <div className="activity-grid" aria-label="活动记录">
                  {activityDays.map((day) => (
                    <span
                      className={`activity-cell is-level-${Math.min(day.count, 4)}`}
                      key={day.date}
                      title={`${day.date} ${day.count} 次`}
                    />
                  ))}
                </div>
                <div className="activity-dates" aria-hidden="true">
                  <span>{formatDay(activityStart)}</span>
                  <span>{formatDay(activityMiddle)}</span>
                  <span>{formatDay(activityEnd)}</span>
                </div>
              </div>
            </section>

            <div className="profile-watermark">algo.dogxi.me</div>
          </div>

          <div className="profile-detail-column">
            {!user && (
              <section className="profile-section profile-local-section">
                <div className="local-profile-edit">
                  <button
                    className="local-avatar-button"
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    aria-label="上传头像"
                    title="上传头像"
                  >
                    {localAvatar ? (
                      <img src={localAvatar} alt="" />
                    ) : (
                      <CircleUserRound size={24} strokeWidth={1.5} />
                    )}
                  </button>
                  <input
                    value={localNameInputValue}
                    onChange={(event) =>
                      onLocalProfileChange({
                        ...localProfile,
                        name: event.target.value,
                      })
                    }
                    aria-label="昵称"
                    placeholder="昵称"
                  />
                  <input
                    ref={avatarInputRef}
                    className="hidden-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      void updateLocalAvatar(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                    aria-label="上传头像文件"
                  />
                </div>
              </section>
            )}

            <section className="profile-section">
              <div className="profile-section-title">
                <span>数据</span>
              </div>
              <div className="profile-actions">
                <button type="button" onClick={exportProfileImage} disabled={isExportingImage}>
                  <ImageDown size={15} strokeWidth={1.8} />
                  <span>{isExportingImage ? "导出中" : "导出图片"}</span>
                </button>
                <button type="button" onClick={onExportNotes} disabled={noteCount === 0}>
                  <Download size={15} strokeWidth={1.8} />
                  <span>导出全部笔记</span>
                </button>
                <button type="button" onClick={onExportBackup}>
                  <Download size={15} strokeWidth={1.8} />
                  <span>导出备份</span>
                </button>
                <button type="button" onClick={() => backupInputRef.current?.click()}>
                  <UploadCloud size={15} strokeWidth={1.8} />
                  <span>导入备份</span>
                </button>
                <input
                  ref={backupInputRef}
                  className="hidden-file-input"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onImportBackup(file);
                    event.target.value = "";
                  }}
                  aria-label="导入备份文件"
                />
              </div>
            </section>

            <section className="profile-section">
              <div className="profile-section-title">
                <span>GitHub Gist</span>
                {syncStatus && <small>{syncStatus}</small>}
              </div>
              {user ? (
                <div className="sync-actions">
                  <button type="button" onClick={onPushSync} disabled={isSyncing}>
                    <UploadCloud size={15} strokeWidth={1.8} />
                    <span>上传</span>
                  </button>
                  <button type="button" onClick={onPullSync} disabled={isSyncing}>
                    <Cloud size={15} strokeWidth={1.8} />
                    <span>拉取</span>
                  </button>
                  {gistUrl && (
                    <a href={gistUrl} target="_blank" rel="noreferrer">
                      查看
                    </a>
                  )}
                </div>
              ) : (
                <div className="sync-actions">
                  <button type="button" onClick={onLogin}>
                    <Github size={15} strokeWidth={1.8} />
                    <span>登录同步</span>
                  </button>
                </div>
              )}
            </section>

            {user && (
              <button className="logout-button" type="button" onClick={onLogout}>
                <LogOut size={15} strokeWidth={1.8} />
                <span>退出登录</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
