"use client";

import { useState } from "react";

import { categories } from "@/lib/mock-data";

export function CategoryFilter(): JSX.Element {
  const [active, setActive] = useState<string>(categories[0]?.id ?? "all");

  return (
    <div className="card" style={{ padding: "20px" }}>
      <div style={{ fontWeight: 700, marginBottom: "12px" }}>Popular services</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        {categories.map((category) => {
          const selected = active === category.id;
          return (
            <button
              key={category.id}
              type="button"
              className="pill"
              style={{
                borderColor: selected ? "var(--brand)" : "var(--line)",
                background: selected ? "rgba(44, 91, 78, 0.12)" : "#fff",
                fontWeight: selected ? 600 : 400
              }}
              onClick={() => setActive(category.id)}
            >
              {category.label}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: "16px", color: "var(--muted)" }}>
        Showing: {categories.find((item) => item.id === active)?.label ?? "All"}
      </div>
    </div>
  );
}
