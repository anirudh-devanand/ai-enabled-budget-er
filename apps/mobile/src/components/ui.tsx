import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { categoryMeta, colors, passwordScore, type CategoryKey } from "../theme";

function Glyph({
  name,
  size = 22,
  color = colors.text,
}: {
  name?: string | null;
  size?: number;
  color?: string;
}) {
  const { key } = categoryMeta(name);
  const s = 1.75;
  const common = {
    stroke: color,
    strokeWidth: s,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none" as const,
  };

  const body: Record<CategoryKey, React.ReactNode> = {
    income: (
      <>
        <Path d="M12 19V5" {...common} />
        <Path d="M7 10l5-5 5 5" {...common} />
      </>
    ),
    transfers: (
      <>
        <Path d="M7 7h11l-3-3" {...common} />
        <Path d="M17 17H6l3 3" {...common} />
      </>
    ),
    groceries: (
      <>
        <Path d="M6 7h12l-1 12H7L6 7z" {...common} />
        <Path d="M9 7V5a3 3 0 0 1 6 0v2" {...common} />
      </>
    ),
    dining: (
      <>
        <Path d="M8 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" {...common} />
        <Path d="M10 13v8" {...common} />
        <Path d="M16 3v18" {...common} />
        <Path d="M16 3c2 0 3 1.5 3 4s-1 4-3 4" {...common} />
      </>
    ),
    transport: (
      <>
        <Rect x="4" y="9" width="16" height="8" rx="2" {...common} />
        <Path d="M7 9V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" {...common} />
        <Circle cx="8" cy="17" r="1.25" fill={color} />
        <Circle cx="16" cy="17" r="1.25" fill={color} />
      </>
    ),
    housing: (
      <>
        <Path d="M3 11l9-7 9 7" {...common} />
        <Path d="M5 10v10h14V10" {...common} />
        <Path d="M10 20v-6h4v6" {...common} />
      </>
    ),
    utilities: <Path d="M13 2L6 13h5l-1 9 8-12h-5l0-8z" {...common} />,
    subscriptions: (
      <>
        <Path d="M4 12a8 8 0 0 1 13.5-5.8" {...common} />
        <Path d="M20 4v5h-5" {...common} />
        <Path d="M20 12a8 8 0 0 1-13.5 5.8" {...common} />
        <Path d="M4 20v-5h5" {...common} />
      </>
    ),
    shopping: (
      <>
        <Path d="M6 8h12l-1 11H7L6 8z" {...common} />
        <Path d="M9 8V6a3 3 0 0 1 6 0v2" {...common} />
        <Path d="M9 12h6" {...common} />
      </>
    ),
    health: (
      <>
        <Rect x="3" y="3" width="18" height="18" rx="4" {...common} />
        <Path d="M12 5v14" {...common} />
        <Path d="M5 12h14" {...common} />
      </>
    ),
    entertainment: (
      <>
        <Rect x="3" y="6" width="18" height="12" rx="2" {...common} />
        <Path d="M10 10l5 2-5 2v-4z" fill={color} stroke="none" />
      </>
    ),
    travel: (
      <>
        <Path d="M10 14l-6 3 1-4 9-7 2 2-6 6z" {...common} />
        <Path d="M14 7l4-3 2 2-3 4" {...common} />
      </>
    ),
    fees: (
      <>
        <Path d="M10.3 4.3L2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" {...common} />
        <Path d="M12 9v4" {...common} />
        <Path d="M12 17h.01" {...common} />
      </>
    ),
    other: (
      <>
        <Circle cx="12" cy="12" r="7" {...common} />
        <Path d="M12 12h.01" {...common} />
      </>
    ),
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body[key]}
    </Svg>
  );
}

export function CategoryIcon({ name }: { name?: string | null }) {
  const { bg } = categoryMeta(name);
  return (
    <View style={[styles.icon, { backgroundColor: bg }]}>
      <Glyph name={name} />
    </View>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, checks } = passwordScore(password);
  const barColor =
    score <= 1
      ? colors.danger
      : score === 2
        ? "#c9811a"
        : score === 3
          ? colors.goldBright
          : colors.goldDeep;

  return (
    <View style={styles.meter}>
      <View style={styles.bars}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[styles.bar, i <= score ? { backgroundColor: barColor } : null]}
          />
        ))}
      </View>
      <Text style={styles.meterLabel}>
        Strength: <Text style={{ fontWeight: "700", color: colors.authText }}>{label}</Text>
      </Text>
      {checks.map((c) => (
        <Text key={c.id} style={[styles.check, c.ok && styles.checkOk]}>
          {c.ok ? "✓" : "○"} {c.label}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  meter: { marginTop: 8, marginBottom: 4 },
  bars: { flexDirection: "row", gap: 6, marginBottom: 6 },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.authBorder,
  },
  meterLabel: { color: colors.authMuted, fontSize: 12, marginBottom: 4 },
  check: { color: colors.authMuted, fontSize: 12, marginTop: 2 },
  checkOk: { color: colors.goldBright },
});
