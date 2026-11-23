import type { NodeColorConfiguration } from "./types.ts";
/** Pastel entity colors, shared by generation and rendering. */
export const DEFAULT_NODE_COLORS: Readonly<Record<string, string>> =
  Object.freeze({
    ORDER: "#BAE6FD",
    FULFILMENT: "#C7D2FE",
    FULFILMENT_PLAN: "#BFDBFE",
    FULFILMENT_OPTIONS: "#E9D5FF",
    FULFILMENT_CHOICE: "#FDBA74",
    RETURN_ORDER: "#FECDD3",
    WAVE: "#DDD6FE",
    LOCATION: "#A7F3D0",
    INVENTORY_CATALOGUE: "#FED7AA",
    INVENTORY_POSITION: "#99F6E4",
    INVENTORY_QUANTITY: "#D9F99D",
    CREDIT_MEMO: "#FBCFE8",
    BILLING_ACCOUNT: "#FDE68A",
    INVOICE: "#BBF7D0",
    ARTICLE: "#F5D0FE",
    CONSIGNMENT: "#FCA5A5",
  });
export const DEFAULT_FALLBACK_COLOR = "#E2E8F0";
export function defaultNodeColorConfiguration(): NodeColorConfiguration {
  return {
    colors: { ...DEFAULT_NODE_COLORS },
    fallbackColor: DEFAULT_FALLBACK_COLOR,
    revision: 0,
  };
}
export function nodeColor(
  type: string,
  configuration: Pick<
    NodeColorConfiguration,
    "colors" | "fallbackColor"
  > = defaultNodeColorConfiguration(),
): string {
  const key = type.trim().toUpperCase();
  return Object.hasOwn(configuration.colors, key)
    ? configuration.colors[key]
    : configuration.fallbackColor;
}
/** Pick the label color with the stronger WCAG contrast for a six-digit fill. */
export function nodeTextColor(fill: string): string {
  const luminance = (hex: string) =>
    [1, 3, 5]
      .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      )
      .reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  const background = luminance(fill),
    dark = luminance("#1F2937");
  return (Math.max(background, dark) + 0.05) /
    (Math.min(background, dark) + 0.05) >=
    1.05 / (background + 0.05)
    ? "#1F2937"
    : "#FFFFFF";
}
