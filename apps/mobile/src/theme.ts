export function money(amount: string | number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(Number(amount));
}

export const colors = {
  bg: "#0e1116",
  card: "#171b22",
  border: "#2a3038",
  text: "#e8eaed",
  muted: "#9aa3ad",
  accent: "#4f8cff",
  danger: "#ff6b6b",
  ok: "#3ecf8e",
};
