import type { BranchMetrics } from "@/lib/analytics";

export default function Heatmap({ branches }: { branches: BranchMetrics[] }) {
  // Top 10 sucursales con más tickets
  const top = branches.slice(0, 10);
  // Áreas únicas
  const areas = Array.from(new Set(top.flatMap((b) => Object.keys(b.byArea)))).sort();
  const maxVal = Math.max(
    ...top.flatMap((b) => areas.map((a) => b.byArea[a] || 0))
  ) || 1;

  return (
    <div className="bg-surface border border-border rounded-xl p-6 overflow-x-auto">
      <h3 className="font-serif font-semibold text-sm uppercase tracking-wider text-muted mb-4">
        Heatmap sucursal × área · Top 10
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left py-2 pr-2 font-medium text-muted">Sucursal</th>
            {areas.map((a) => (
              <th key={a} className="px-2 py-2 font-medium text-muted text-center">
                {a}
              </th>
            ))}
            <th className="px-2 py-2 font-medium text-muted text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {top.map((b) => (
            <tr key={b.name} className="border-t border-border">
              <td className="py-2 pr-2 font-medium">{b.name}</td>
              {areas.map((a) => {
                const v = b.byArea[a] || 0;
                const intensity = v / maxVal;
                const bg =
                  v === 0
                    ? "transparent"
                    : `rgba(37, 73, 87, ${0.08 + intensity * 0.6})`;
                const color = intensity > 0.5 ? "#fff" : "#1d1d1b";
                return (
                  <td
                    key={a}
                    className="px-2 py-2 text-center font-mono"
                    style={{ background: bg, color }}
                  >
                    {v || ""}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-right font-mono font-semibold">{b.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
