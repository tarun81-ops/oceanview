interface Props {
  title: string;
  detail: string;
  onRetry?: () => void;
}

/** Shared presentation for loading, load-failure, and no-WebGL states. */
export function StatusScreen({ title, detail, onRetry }: Props) {
  return (
    <div className="state" role="status" aria-live="polite">
      <p className="state__title">{title}</p>
      <p className="state__detail">{detail}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
