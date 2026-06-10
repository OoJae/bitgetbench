import type { Stats } from "../lib/data";

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-edge bg-panel px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString("en-US")}</div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

export function Counters({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Counter label="Agents" value={stats.agentsRegistered} />
      <Counter label="Backtests" value={stats.backtestsRun} />
      <Counter label="Sandbox cycles" value={stats.sandboxCycles} />
      <Counter label="Sim trades" value={stats.simTrades} />
      <Counter label="API calls" value={stats.apiCalls} />
      <Counter label="Users" value={stats.distinctUsers} />
    </div>
  );
}
