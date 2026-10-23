interface StatusRegionProps {
  readonly children: React.ReactNode;
}

// Stays mounted on purpose: aria-live only announces content changes inside a region that
// was already present when the change happened.
export function StatusRegion({ children }: StatusRegionProps): React.JSX.Element {
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {children}
    </div>
  );
}
