"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { WeeklyPoint } from "@/lib/analytics";

export default function WeeklyTrend({ data }: { data: WeeklyPoint[] }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="font-serif font-semibold text-sm uppercase tracking-wider text-muted mb-4">
        Tendencia semanal de ingresos · Q2
      </h3>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e2d8" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6a6862" }} />
            <YAxis tick={{ fontSize: 11, fill: "#6a6862" }} />
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid #e6e2d8",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="newTickets" stroke="#254957" strokeWidth={2} name="Nuevos" dot={{ r: 3 }} />
            <Line type="monotone" dataKey="closed" stroke="#339f8f" strokeWidth={2} name="Cerrados" dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
