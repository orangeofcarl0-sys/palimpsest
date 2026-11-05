"use strict";

/**
 * The protobuf subset the service contract needs, plus the gRPC message framing.
 *
 * Wire types used: 0 (varint) for int32/int64 and 2 (length-delimited) for string and nested
 * messages. A gRPC message is a 5-byte header — one compressed-flag byte (always 0 here) and a 4-byte
 * big-endian length — followed by the protobuf bytes.
 *
 * The encoder is driven by the field numbers declared in proto/energy.proto. A change to a field
 * number is a wire change and must be treated as one.
 */

// ── protobuf primitives ───────────────────────────────────────────────────────────────────────────

function encodeVarint(value) {
  let remaining = typeof value === "bigint" ? value : BigInt(value);
  if (remaining < 0n) throw new RangeError("varint cannot encode a negative value");
  const bytes = [];
  while (remaining > 0x7fn) {
    bytes.push(Number(remaining & 0x7fn) | 0x80);
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return Buffer.from(bytes);
}

function decodeVarint(buffer, offset) {
  let value = 0n;
  let shift = 0n;
  let index = offset;
  for (;;) {
    if (index >= buffer.length) throw new RangeError("truncated varint");
    const byte = buffer[index];
    index += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 63n) throw new RangeError("varint is too long");
  }
  return { value, offset: index };
}

function tag(field, wireType) {
  return encodeVarint((field << 3) | wireType);
}

function encodeString(field, value) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([tag(field, 2), encodeVarint(bytes.length), bytes]);
}

function encodeInt(field, value) {
  return Buffer.concat([tag(field, 0), encodeVarint(value)]);
}

function readFields(buffer) {
  const fields = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const header = decodeVarint(buffer, offset);
    offset = header.offset;
    const field = Number(header.value >> 3n);
    const wireType = Number(header.value & 7n);
    if (wireType === 0) {
      const value = decodeVarint(buffer, offset);
      offset = value.offset;
      fields.set(field, value.value);
    } else if (wireType === 2) {
      const length = decodeVarint(buffer, offset);
      offset = length.offset;
      const end = offset + Number(length.value);
      if (end > buffer.length) throw new RangeError("truncated length-delimited field");
      fields.set(field, buffer.subarray(offset, end));
      offset = end;
    } else {
      throw new RangeError(`unsupported wire type ${String(wireType)}`);
    }
  }
  return fields;
}

// ── messages ─────────────────────────────────────────────────────────────────────────────────────

function encodeSiteRequest(request) {
  return encodeString(1, request.siteId);
}

function decodeSiteRequest(buffer) {
  const fields = readFields(buffer);
  return { siteId: fields.get(1)?.toString("utf8") ?? "" };
}

function encodeReading(reading) {
  return Buffer.concat([encodeString(1, reading.siteId), encodeInt(2, reading.watts), encodeInt(3, reading.atMs)]);
}

function decodeReading(buffer) {
  const fields = readFields(buffer);
  return {
    siteId: fields.get(1)?.toString("utf8") ?? "",
    watts: Number(fields.get(2) ?? 0n),
    atMs: Number(fields.get(3) ?? 0n),
  };
}

function encodeStreamRequest(request) {
  return Buffer.concat([encodeString(1, request.siteId), encodeInt(2, request.limit)]);
}

function decodeStreamRequest(buffer) {
  const fields = readFields(buffer);
  return { siteId: fields.get(1)?.toString("utf8") ?? "", limit: Number(fields.get(2) ?? 0n) };
}

function encodeStatus(status) {
  return Buffer.concat([encodeString(1, status.code), encodeString(2, status.message)]);
}

function decodeStatus(buffer) {
  const fields = readFields(buffer);
  return { code: fields.get(1)?.toString("utf8") ?? "", message: fields.get(2)?.toString("utf8") ?? "" };
}

// ── gRPC framing ─────────────────────────────────────────────────────────────────────────────────

const FRAME_HEADER_BYTES = 5;

function frame(payload) {
  const header = Buffer.alloc(FRAME_HEADER_BYTES);
  header[0] = 0; // not compressed
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

/** One frame from a complete buffer; throws when the length prefix does not match. */
function unframe(buffer) {
  if (buffer.length < FRAME_HEADER_BYTES) throw new RangeError("truncated frame header");
  const length = buffer.readUInt32BE(1);
  if (buffer.length !== FRAME_HEADER_BYTES + length) {
    throw new RangeError(`frame length ${String(length)} does not match ${String(buffer.length - FRAME_HEADER_BYTES)} bytes`);
  }
  return buffer.subarray(FRAME_HEADER_BYTES);
}

/** Every complete frame in an accumulated buffer, plus the bytes of a partial trailing frame. */
function drainFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (buffer.length - offset >= FRAME_HEADER_BYTES) {
    const length = buffer.readUInt32BE(offset + 1);
    if (buffer.length - offset - FRAME_HEADER_BYTES < length) break;
    messages.push(buffer.subarray(offset + FRAME_HEADER_BYTES, offset + FRAME_HEADER_BYTES + length));
    offset += FRAME_HEADER_BYTES + length;
  }
  return { messages, rest: buffer.subarray(offset) };
}

module.exports = {
  FRAME_HEADER_BYTES,
  decodeReading,
  decodeSiteRequest,
  decodeStatus,
  decodeStreamRequest,
  drainFrames,
  encodeReading,
  encodeSiteRequest,
  encodeStatus,
  encodeStreamRequest,
  frame,
  unframe,
};
