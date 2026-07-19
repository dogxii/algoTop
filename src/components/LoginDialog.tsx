import { Github, X } from "lucide-react";

type LoginDialogProps = {
  error: string;
  isConfigured: boolean;
  isLoading: boolean;
  onClose: () => void;
  onLogin: () => void;
};

export function LoginDialog({
  error,
  isConfigured,
  isLoading,
  onClose,
  onLogin,
}: LoginDialogProps) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="login-dialog" role="dialog" aria-modal="true">
        <button
          className="icon-button dialog-close"
          type="button"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          <X size={15} strokeWidth={1.8} />
        </button>

        <div className="login-dialog-title">
          <Github size={18} strokeWidth={1.8} />
          <span>GitHub 登录</span>
        </div>

        <p className="login-dialog-note">
          授权后可将刷题进度和笔记同步到你的 GitHub Gist。
        </p>

        {!isConfigured && (
          <p className="login-error">
            需要配置 GitHub OAuth Client ID。
          </p>
        )}
        {error && <p className="login-error">{error}</p>}

        <button
          className="login-submit"
          type="button"
          onClick={onLogin}
          disabled={!isConfigured || isLoading}
        >
          {isLoading ? "跳转中" : "使用 GitHub 登录"}
        </button>
      </section>
    </div>
  );
}
