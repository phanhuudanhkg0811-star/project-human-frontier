import { useState, type ImgHTMLAttributes, type SyntheticEvent } from 'react';

export interface SafeImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  fallbackSrc?: string;
  fallbackLabel?: string;
}

/** Image element with deterministic fallback when an asset fails to load. */
export function SafeImage({
  src,
  alt = '',
  fallbackSrc,
  fallbackLabel,
  className = '',
  onError,
  ...rest
}: SafeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  const primaryFailed = Boolean(src) && failedSrc === src;
  const activeSrc = primaryFailed && !fallbackFailed ? fallbackSrc : src;

  if ((primaryFailed && !fallbackSrc) || (primaryFailed && fallbackFailed)) {
    const label = fallbackLabel || alt || 'N/A';
    return (
      <span
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={`inline-flex items-center justify-center rounded border border-slate-600/60 bg-slate-800/70 px-2 py-1 text-[11px] font-mono text-slate-300 ${className}`.trim()}
      >
        {label}
      </span>
    );
  }

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    if (!primaryFailed && src) {
      setFailedSrc(src);
    } else {
      setFallbackFailed(true);
    }
    onError?.(event);
  };

  return (
    <img
      {...rest}
      src={activeSrc}
      alt={alt}
      className={className}
      onError={handleError}
    />
  );
}
