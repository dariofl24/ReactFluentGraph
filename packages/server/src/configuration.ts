import type { NodeColorConfiguration } from "../../shared/src/types.ts";
import { ApiError } from "./errors.ts";
import { isObject } from "./graph.ts";
const bad = (message: string) =>
  new ApiError(400, "INVALID_CONFIGURATION", message);
export function validateNodeColors(body: unknown): NodeColorConfiguration {
  if (!isObject(body) || !isObject(body.colors))
    throw bad("Provide a colors object.");
  if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 0)
    throw bad("Provide the configuration revision.");
  const hex = (value: unknown): string => {
    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value))
      throw bad("Colors must use six-digit hex values, such as #BAE6FD.");
    return value.toUpperCase();
  };
  const entries: [string, string][] = [];
  const seen = new Set<string>();
  for (const [rawType, color] of Object.entries(body.colors)) {
    const type = rawType.trim().toUpperCase();
    if (!type || type.length > 100)
      throw bad("Type names must contain 1 to 100 characters.");
    if (seen.has(type)) throw bad(`Type ${type} is configured more than once.`);
    seen.add(type);
    entries.push([type, hex(color)]);
  }
  return {
    colors: Object.fromEntries(entries),
    fallbackColor: hex(body.fallbackColor),
    revision: body.revision as number,
  };
}
