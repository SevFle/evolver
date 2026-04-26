export function DeliveryRateChart({
  data,
}: {
  data: { date: string; success: number; failed: number }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No delivery data yet
      </div>
    );
  }

  const max = Math.max(...data.flatMap((d) => [d.success, d.failed]), 1);

  return (
    <div className="flex h-64 items-end gap-1">
      {data.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full gap-px">
            <div
              className="flex-1 bg-green-500 rounded-t"
              style={{ height: `${(d.success / max) * 200}px` }}
            />
            <div
              className="flex-1 bg-red-500 rounded-t"
              style={{ height: `${(d.failed / max) * 200}px` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
