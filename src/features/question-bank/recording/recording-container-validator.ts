import type { RecordingFormat } from './types';

export type RecordingContainerInspection = {
  audioTrackCount: number;
  mediaBytes: number;
  mediaDurationMs?: number;
  status: 'valid' | 'invalid' | 'incomplete';
};

type Box = {
  end: number;
  payloadOffset: number;
  type: string;
};

function ascii(bytes: Uint8Array, offset: number, length: number) {
  if (offset < 0 || offset + length > bytes.length) return '';
  let value = '';
  for (let index = offset; index < offset + length; index += 1) value += String.fromCharCode(bytes[index]);
  return value;
}

function uint32BigEndian(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return ((bytes[offset] * 0x1000000)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]) >>> 0;
}

function uint32LittleEndian(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) return undefined;
  return (bytes[offset]
    + (bytes[offset + 1] << 8)
    + (bytes[offset + 2] << 16)
    + (bytes[offset + 3] * 0x1000000)) >>> 0;
}

function uint64BigEndian(bytes: Uint8Array, offset: number) {
  const high = uint32BigEndian(bytes, offset);
  const low = uint32BigEndian(bytes, offset + 4);
  if (high === undefined || low === undefined) return undefined;
  const value = high * 0x100000000 + low;
  return Number.isSafeInteger(value) ? value : undefined;
}

function boxesWithin(bytes: Uint8Array, start: number, end: number): Box[] | undefined {
  const result: Box[] = [];
  let offset = start;
  while (offset + 8 <= end && result.length < 512) {
    const size32 = uint32BigEndian(bytes, offset);
    if (size32 === undefined) return undefined;
    const type = ascii(bytes, offset + 4, 4);
    let headerSize = 8;
    let boxSize = size32;
    if (size32 === 1) {
      boxSize = uint64BigEndian(bytes, offset + 8) ?? 0;
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = end - offset;
    }
    if (!Number.isSafeInteger(boxSize) || boxSize < headerSize || offset + boxSize > end) return undefined;
    result.push({ end: offset + boxSize, payloadOffset: offset + headerSize, type });
    offset += boxSize;
  }
  return offset === end ? result : undefined;
}

function m4aAudioTrackDuration(bytes: Uint8Array, moov: Box) {
  const moovChildren = boxesWithin(bytes, moov.payloadOffset, moov.end);
  if (!moovChildren) return { audioTrackCount: 0, incomplete: true, mediaDurationMs: undefined };
  let audioTrackCount = 0;
  let mediaDurationMs: number | undefined;
  for (const trak of moovChildren.filter((box) => box.type === 'trak')) {
    const trakChildren = boxesWithin(bytes, trak.payloadOffset, trak.end);
    const mdia = trakChildren?.find((box) => box.type === 'mdia');
    if (!mdia) continue;
    const mediaChildren = boxesWithin(bytes, mdia.payloadOffset, mdia.end);
    if (!mediaChildren) return { audioTrackCount, incomplete: true, mediaDurationMs };
    const handler = mediaChildren.find((box) => box.type === 'hdlr');
    if (!handler || ascii(bytes, handler.payloadOffset + 8, 4) !== 'soun') continue;
    audioTrackCount += 1;
    const header = mediaChildren.find((box) => box.type === 'mdhd');
    if (!header || header.payloadOffset + 20 > header.end) continue;
    const version = bytes[header.payloadOffset];
    const timescaleOffset = header.payloadOffset + (version === 1 ? 20 : 12);
    const durationOffset = header.payloadOffset + (version === 1 ? 24 : 16);
    const timescale = uint32BigEndian(bytes, timescaleOffset);
    const duration = version === 1
      ? uint64BigEndian(bytes, durationOffset)
      : uint32BigEndian(bytes, durationOffset);
    if (!timescale || duration === undefined) continue;
    const durationMs = duration * 1_000 / timescale;
    if (Number.isFinite(durationMs) && durationMs > 0) {
      mediaDurationMs = Math.max(mediaDurationMs ?? 0, durationMs);
    }
  }
  return { audioTrackCount, incomplete: false, mediaDurationMs };
}

function inspectM4a(bytes: Uint8Array): RecordingContainerInspection {
  const empty = { audioTrackCount: 0, mediaBytes: 0 };
  if (bytes.length < 12) return { ...empty, status: 'incomplete' };
  if (ascii(bytes, 4, 4) !== 'ftyp') return { ...empty, status: 'invalid' };
  const boxes = boxesWithin(bytes, 0, bytes.length);
  if (!boxes) return { ...empty, status: 'incomplete' };
  const sawFtyp = boxes.some((box) => box.type === 'ftyp');
  const moov = boxes.find((box) => box.type === 'moov');
  let mediaBytes = 0;
  for (const box of boxes) if (box.type === 'mdat') mediaBytes += box.end - box.payloadOffset;
  if (!sawFtyp) return { ...empty, mediaBytes, status: 'invalid' };
  if (!moov || mediaBytes <= 0) return { ...empty, mediaBytes, status: 'incomplete' };
  const track = m4aAudioTrackDuration(bytes, moov);
  if (track.incomplete) return { audioTrackCount: track.audioTrackCount, mediaBytes, status: 'incomplete' };
  if (track.audioTrackCount <= 0) return { audioTrackCount: 0, mediaBytes, status: 'invalid' };
  if (!track.mediaDurationMs) return { audioTrackCount: track.audioTrackCount, mediaBytes, status: 'incomplete' };
  return {
    audioTrackCount: track.audioTrackCount,
    mediaBytes,
    mediaDurationMs: track.mediaDurationMs,
    status: 'valid',
  };
}

function inspectWav(bytes: Uint8Array): RecordingContainerInspection {
  const empty = { audioTrackCount: 0, mediaBytes: 0 };
  if (bytes.length < 12) return { ...empty, status: 'incomplete' };
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
    return { ...empty, status: 'invalid' };
  }
  const riffSize = uint32LittleEndian(bytes, 4);
  if (riffSize === undefined || riffSize + 8 > bytes.length) return { ...empty, status: 'incomplete' };
  let offset = 12;
  let sawFormat = false;
  let mediaBytes = 0;
  let byteRate = 0;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const chunkSize = uint32LittleEndian(bytes, offset + 4);
    if (chunkSize === undefined) return { ...empty, mediaBytes, status: 'incomplete' };
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.length) return { ...empty, mediaBytes, status: 'incomplete' };
    if (type === 'fmt ' && chunkSize >= 16) {
      sawFormat = true;
      byteRate = uint32LittleEndian(bytes, dataOffset + 8) ?? 0;
    }
    if (type === 'data') mediaBytes += chunkSize;
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  if (!sawFormat || mediaBytes <= 0 || byteRate <= 0) return { ...empty, mediaBytes, status: 'incomplete' };
  return { audioTrackCount: 1, mediaBytes, mediaDurationMs: mediaBytes * 1_000 / byteRate, status: 'valid' };
}

export function inspectRecordingContainer(bytes: Uint8Array, format: RecordingFormat): RecordingContainerInspection {
  if (format === 'm4a') return inspectM4a(bytes);
  if (format === 'wav') return inspectWav(bytes);
  return {
    audioTrackCount: bytes.length > 0 ? 1 : 0,
    mediaBytes: bytes.length,
    status: bytes.length > 0 ? 'valid' : 'incomplete',
  };
}
