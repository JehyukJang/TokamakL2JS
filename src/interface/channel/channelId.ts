import type { ChannelIdJson } from "./types.js";

export const MAX_CHANNEL_ID = (1n << 256n) - 1n;

const CANONICAL_DECIMAL_PATTERN = /^(0|[1-9][0-9]*)$/;

export function parseChannelId(value: ChannelIdJson): bigint {
  if (typeof value !== "string" || !CANONICAL_DECIMAL_PATTERN.test(value)) {
    throw new Error("Channel ID must be a canonical unsigned decimal string");
  }

  const channelId = BigInt(value);
  if (channelId > MAX_CHANNEL_ID) {
    throw new Error("Channel ID must fit in the uint256 range");
  }
  return channelId;
}

export function formatChannelId(value: bigint): ChannelIdJson {
  if (typeof value !== "bigint" || value < 0n || value > MAX_CHANNEL_ID) {
    throw new Error("Channel ID must be a bigint in the uint256 range");
  }
  return value.toString();
}
