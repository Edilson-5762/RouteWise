interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-red-700"
    >
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Tentar novamente
        </button>
      )}
    </div>
  );
}
