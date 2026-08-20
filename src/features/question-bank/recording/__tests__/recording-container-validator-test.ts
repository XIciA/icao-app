import { inspectRecordingContainer } from '../recording-container-validator';

function text(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}

function m4aBox(type: string, payloadSize: number) {
  const bytes = new Uint8Array(8 + payloadSize);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length, false);
  text(bytes, 4, type);
  return bytes;
}

function concat(...parts: Uint8Array[]) {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function wave(dataBytes: number) {
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  text(bytes, 0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(bytes, 8, 'WAVE');
  text(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(bytes, 36, 'data');
  view.setUint32(40, dataBytes, true);
  return bytes;
}

describe('recording container validation', () => {
  it('accepts a complete M4A container with metadata and media data', () => {
    const bytes = concat(m4aBox('ftyp', 8), m4aBox('mdat', 32), m4aBox('moov', 12));
    expect(inspectRecordingContainer(bytes, 'm4a')).toEqual({ mediaBytes: 32, status: 'valid' });
  });

  it('treats an M4A without its final metadata box as incomplete', () => {
    const bytes = concat(m4aBox('ftyp', 8), m4aBox('mdat', 32));
    expect(inspectRecordingContainer(bytes, 'm4a')).toEqual({ mediaBytes: 32, status: 'incomplete' });
  });

  it('rejects bytes whose declared format is M4A but whose container is different', () => {
    expect(inspectRecordingContainer(wave(32), 'm4a')).toEqual({ mediaBytes: 0, status: 'invalid' });
  });

  it('accepts a complete WAV container and rejects header-only WAV', () => {
    expect(inspectRecordingContainer(wave(32), 'wav')).toEqual({ mediaBytes: 32, status: 'valid' });
    expect(inspectRecordingContainer(wave(0), 'wav')).toEqual({ mediaBytes: 0, status: 'incomplete' });
  });
});
