"use client";

import { CategoryGlyph } from "@/components/CategoryIcon";
import { categoryMeta } from "@/lib/ui";

type Pref = { icon_key?: string | null; color?: string | null };

export function CategoryIcon({
  name,
  pref,
}: {
  name?: string | null;
  pref?: Pref | null;
}) {
  const fallback = categoryMeta(name);
  const bg = pref?.color || fallback.bg;
  const iconKey = pref?.icon_key || fallback.key;
  return (
    <div className="cat-icon" style={{ background: bg }} aria-hidden>
      <CategoryGlyph name={iconKey} />
    </div>
  );
}
