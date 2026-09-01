import { AlertTriangle, Inbox } from "lucide-react";

export function LoadingState({ message = "불러오는 중입니다." }) {
  return (
    <div className="page-state page-state--loading" role="status">
      <div className="loading-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{message}</p>
    </div>
  );
}

type ErrorStateProps = {
  message?: string;
  requestId?: string;
  onRetry?: () => void;
};

export function ErrorState({
  message = "요청을 처리하지 못했습니다.",
  requestId,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="page-state" role="alert">
      <AlertTriangle size={32} />
      <strong>{message}</strong>

      {requestId && <small>요청 ID: {requestId}</small>}

      {onRetry && (
        <button
          type="button"
          className="button button--secondary"
          onClick={onRetry}
        >
          다시 시도
        </button>
      )}
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="page-state">
      <Inbox size={32} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
