import type { RecordingFormat } from './types';

export type RecordingContainerInspection = {
  mediaBytes: number;
  status: 'valid' | 'invalid' | 'incomplete';
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

function inspectM4a(bytes: Uint8Array): RecordingContainerInspection {
  if (bytes.length < 12) return { mediaBytes: 0, status: 'incomplete' };
  if (ascii(bytes, 4, 4) !== 'ftyp') return { mediaBytes: 0, status: 'invalid' };

  let offset = 0;
  let sawFtyp = false;
  let sawMoov = false;
  let mediaBytes = 0;
  let boxes = 0;
  while (offset + 8 <= bytes.length && boxes < 256) {
    const size32 = uint32BigEndian(bytes, offset);
    if (size32 === undefined) return { mediaBytes, status: 'incomplete' };
    const type = ascii(bytes, offset + 4, 4);
    let headerSize = 8;
    let boxSize = size32;
    if (size32 === 1) {
      if (offset + 16 > bytes.length) return { mediaBytes, status: 'incomplete' };
      const high = uint32BigEndian(bytes, offset + 8) ?? 0;
      const low = uint32BigEndian(bytes, offset + 12) ?? 0;
      boxSize = high * 0x100000000 + low;
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = bytes.length - offset;
    }
    if (!Number.isSafeInteger(boxSize) || boxSize < headerSize) {
      return { mediaBytes, status: 'invalid' };
    }
    if (offset + boxSize > bytes.length) return { mediaBytes, status: 'incomplete' };
    if (type === 'ftyp') sawFtyp = true;
    if (type === 'moov') sawMoov = true;
    if (type === 'mdat') mediaBytes += boxSize - headerSize;
    offset += boxSize;
    boxes += 1;
  }

  if (!sawFtyp) return { mediaBytes, status: 'invalid' };
  if (!sawMoov || mediaBytes <= 0 || offset !== bytes.length) {
    return { mediaBytes, status: 'incomplete' };
  }
  return { mediaBytes, status: 'valid' };
}

function inspectWav(bytes: Uint8Array): RecordingContainerInspection {
  if (bytes.length < 12) return { mediaBytes: 0, status: 'incomplete' };
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
    return { mediaBytes: 0, status: 'invalid' };
  }
  const riffSize = uint32LittleEndian(bytes, 4);
  if (riffSize === undefined || riffSize + 8 > bytes.length) return { mediaBytes: 0, status: 'incomplete' };

  let offset = 12;
  let sawFormat = false;
  let mediaBytes = 0;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const chunkSize = uint32LittleEndian(bytes, offset + 4);
    if (chunkSize === undefined) return { mediaBytes, status: 'incomplete' };
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.length) return { mediaBytes, status: 'incomplete' };
    if (type === 'fmt ' && chunkSize >= 16) sawFormat = true;
    if (type === 'data') mediaBytes += chunkSize;
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  if (!sawFormat || mediaBytes <= 0) return { mediaBytes, status: 'incomplete' };
  return { mediaBytes, status: 'valid' };
}

export function inspectRecordingContainer(bytes: Uint8Array, format: RecordingFormat): RecordingContainerInspection {
  if (format === 'm4a') return inspectM4a(bytes);
  if (format === 'wav') return inspectWav(bytes);
  return { mediaBytes: bytes.length, status: bytes.length > 0 ? 'valid' : 'incomplete' };
}
