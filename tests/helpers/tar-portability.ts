import { gunzipSync } from "node:zlib";

export type TarPortabilityViolation = Readonly<{
  kind: "apple-double" | "xattr";
  member: string;
  key?: string;
}>;

function textField(bytes: Buffer, start: number, length: number): string {
  const field = bytes.subarray(start, start + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString("utf8");
}

function octalField(bytes: Buffer, start: number, length: number): number {
  const value = textField(bytes, start, length).trim().replace(/^0+/, "");
  return value === "" ? 0 : Number.parseInt(value, 8);
}

function paxFields(bytes: Buffer): Map<string, string> {
  const fields = new Map<string, string>();
  let cursor = 0;
  while (cursor < bytes.length) {
    const separator = bytes.indexOf(0x20, cursor);
    if (separator === -1) break;
    const length = Number.parseInt(bytes.subarray(cursor, separator).toString("ascii"), 10);
    if (!Number.isSafeInteger(length) || length <= 0 || cursor + length > bytes.length) break;
    const record = bytes.subarray(separator + 1, cursor + length).toString("utf8").replace(/\n$/, "");
    const equals = record.indexOf("=");
    if (equals !== -1) fields.set(record.slice(0, equals), record.slice(equals + 1));
    cursor += length;
  }
  return fields;
}

function isAppleDouble(path: string): boolean {
  return path.split("/").some((component) => component.startsWith("._"));
}

export function inspectTarGzPortability(archive: Uint8Array): TarPortabilityViolation[] {
  const tar = gunzipSync(archive);
  const violations: TarPortabilityViolation[] = [];
  let cursor = 0;
  let pendingLongName: string | null = null;
  let pendingPaxPath: string | null = null;

  while (cursor + 512 <= tar.length) {
    const header = tar.subarray(cursor, cursor + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = textField(header, 0, 100);
    const prefix = textField(header, 345, 155);
    const rawMember = prefix ? `${prefix}/${name}` : name;
    const type = String.fromCharCode(header[156] ?? 0);
    const size = octalField(header, 124, 12);
    const dataStart = cursor + 512;
    const data = tar.subarray(dataStart, dataStart + size);

    if (type === "x" || type === "g") {
      const fields = paxFields(data);
      for (const key of fields.keys()) {
        if (key.includes("xattr")) violations.push({ kind: "xattr", member: rawMember, key });
      }
      if (type === "x") pendingPaxPath = fields.get("path") ?? null;
    } else if (type === "L") {
      pendingLongName = textField(data, 0, data.length);
    } else {
      const member = pendingPaxPath ?? pendingLongName ?? rawMember;
      if (isAppleDouble(member)) violations.push({ kind: "apple-double", member });
      pendingLongName = null;
      pendingPaxPath = null;
    }

    cursor = dataStart + Math.ceil(size / 512) * 512;
  }

  return violations;
}
