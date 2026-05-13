interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "accent" | "green" | "amber" | "red";
}

const toneClass = {
  accent: "border-t-accent",
  green: "border-t-brugaligreen",
  amber: "border-t-brugaliamber",
  red: "border-t-brugalired",
};

export default function KpiCard({ label, value, sub, tone = "accent" }: KpiCardProps) {
  return (
    <div
      className={`bg-surface border border-border rounded-xl p-6 border-t-4 ${toneClass[tone]}`}
    >
      <div className="text-xs uppercase tracking-wide text-muted font-semibold mb-2">
        {label}
      </div>
      <div className="font-mono text-4xl font-semibold text-text leading-none mb-2">
        {value}
      </div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
