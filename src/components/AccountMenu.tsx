import {
  Check,
  ChevronDown,
  CircleUserRound,
  Cloud,
  FileText,
  Github,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Sun,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GithubUser, LocalProfile } from "../lib/account";

type ThemePreference = "system" | "light" | "dark";

type AccountMenuProps = {
  user: GithubUser | null;
  localProfile: LocalProfile;
  noteCount: number;
  syncMessage: string;
  isSyncing: boolean;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onOpenProfile: () => void;
  onOpenNotes: () => void;
  onLogin: () => void;
  onLogout: () => void;
  onPushSync: () => void;
  onPullSync: () => void;
};

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Monitor;
}> = [
  { value: "system", label: "跟随系统", icon: Monitor },
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
];

export function AccountMenu({
  user,
  localProfile,
  noteCount,
  syncMessage,
  isSyncing,
  themePreference,
  onThemeChange,
  onOpenProfile,
  onOpenNotes,
  onLogin,
  onLogout,
  onPushSync,
  onPullSync,
}: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentThemeLabel =
    THEME_OPTIONS.find((option) => option.value === themePreference)?.label ?? "外观";
  const visibleSyncMessage = syncMessage.trim();

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function closeAndRun(action: () => void) {
    setIsOpen(false);
    action();
  }

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        className={user ? "account-trigger avatar-trigger" : "account-trigger"}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label="我的"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {user ? <img src={user.avatarUrl} alt="" /> : <span>我的</span>}
        <ChevronDown size={13} strokeWidth={1.8} />
      </button>

      {isOpen && (
        <div className="account-popover" role="menu">
          <div className="account-summary">
            {user ? (
              <button type="button" onClick={() => closeAndRun(onOpenProfile)}>
                <img src={user.avatarUrl} alt="" />
                <span>
                  <strong>{user.name || user.login}</strong>
                  <small>@{user.login}</small>
                </span>
              </button>
            ) : (
              <button type="button" onClick={() => closeAndRun(onOpenProfile)}>
                {localProfile.avatarUrl ? (
                  <img src={localProfile.avatarUrl} alt="" />
                ) : (
                  <span className="account-local-avatar">
                    <CircleUserRound size={24} strokeWidth={1.6} />
                  </span>
                )}
                <span>
                  <strong>{localProfile.name || "本地用户"}</strong>
                </span>
              </button>
            )}
          </div>

          <div className="account-menu-section">
            <button type="button" className="account-row" onClick={() => closeAndRun(onOpenNotes)}>
              <FileText size={17} strokeWidth={1.8} />
              <span>笔记</span>
              <small>{noteCount}</small>
            </button>
            {user ? (
              <>
                <button
                  className="account-row"
                  type="button"
                  onClick={() => closeAndRun(onPushSync)}
                  disabled={isSyncing}
                >
                  <UploadCloud size={17} strokeWidth={1.8} />
                  <span>上传到 Gist</span>
                  {visibleSyncMessage && <small>{visibleSyncMessage}</small>}
                </button>
                <button
                  className="account-row"
                  type="button"
                  onClick={() => closeAndRun(onPullSync)}
                  disabled={isSyncing}
                >
                  <Cloud size={17} strokeWidth={1.8} />
                  <span>从 Gist 拉取</span>
                </button>
              </>
            ) : (
              <button
                className="account-row"
                type="button"
                onClick={() => closeAndRun(onLogin)}
              >
                <LogIn size={17} strokeWidth={1.8} />
                <span>GitHub 登录</span>
                <Github size={15} strokeWidth={1.8} />
              </button>
            )}
            <a
              className="account-row"
              href="https://github.com/dogxii/algoTop"
              target="_blank"
              rel="noreferrer"
              onClick={() => setIsOpen(false)}
            >
              <Github size={17} strokeWidth={1.8} />
              <span>仓库</span>
            </a>
          </div>

          <div className="account-menu-section">
            <button
              className="account-row account-theme-trigger"
              type="button"
              onClick={() => setIsThemeOpen((current) => !current)}
              aria-expanded={isThemeOpen}
            >
              <Monitor size={17} strokeWidth={1.8} />
              <span>外观</span>
              <small>{currentThemeLabel}</small>
              <ChevronDown
                className={isThemeOpen ? "is-open" : ""}
                size={15}
                strokeWidth={1.8}
              />
            </button>
            {isThemeOpen && (
              <div className="theme-options" role="radiogroup" aria-label="外观">
                {THEME_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSelected = themePreference === option.value;

                  return (
                    <button
                      className={isSelected ? "is-selected" : ""}
                      type="button"
                      key={option.value}
                      onClick={() => onThemeChange(option.value)}
                      role="radio"
                      aria-checked={isSelected}
                    >
                      <Icon size={15} strokeWidth={1.8} />
                      <span>{option.label}</span>
                      <Check size={15} strokeWidth={1.8} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {user && (
            <button
              className="account-row account-logout"
              type="button"
              onClick={() => closeAndRun(onLogout)}
            >
              <LogOut size={17} strokeWidth={1.8} />
              <span>退出登录</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
