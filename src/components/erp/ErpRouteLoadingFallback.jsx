/** Shared spinner for `next/dynamic` route chunks */
export default function ErpRouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-200 border-t-[#103D4D]" />
    </div>
  );
}
