"use client";

import { BrandedShell } from "@/components/BrandedShell";

export default function TrackingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <BrandedShell>
      <div className="tracking-error">
        <svg
          className="tracking-error-icon"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h1 className="tracking-error-title">Something went wrong</h1>
        <p className="tracking-error-text">
          We couldn&apos;t load the tracking information. Please try again.
        </p>
        <button className="tracking-error-retry" onClick={reset}>
          Try Again
        </button>
      </div>
    </BrandedShell>
  );
}
