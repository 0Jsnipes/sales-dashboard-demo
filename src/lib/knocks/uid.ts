import { createHash } from "crypto";
import type { KnockSource } from "./types";

const text = (value: unknown) => String(value ?? "").trim();

export function generateKnockUid(row: Record<string, unknown>, source: KnockSource) {
  if (source === "att_salesrabbit") {
    const id = text(row["Id"]);
    return id ? `att_salesrabbit:${id}` : "";
  }
  const seed = [
    source,
    text(row.external_id),
    text(row["Lead ID"]),
    text(row["Disposition Time (Eastern)"]),
    text(row.Status),
    text(row.street_1),
    text(row.Zip),
  ].join("|");
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  return `tfiber_${hash}`;
}
