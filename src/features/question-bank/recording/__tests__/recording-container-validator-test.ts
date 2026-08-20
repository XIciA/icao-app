import { inspectRecordingContainer } from '../recording-container-validator';

function text(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}

function box(type: string, payloadBytes: number) {
  const bytes = new Uint8Array(8 + payloadBytes);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  text(bytes, 4, type);
  return bytes;
}

function join(...chunks: Uint8Array[]) {
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
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
  text(bytes, 36, 'data');
  view.setUint32(40, dataBytes, true);
  return bytes;
}

describe('recording container validator', () => {
  it('requires ftyp, moov, and non-empty mdat for M4A', () => {
    expect(inspectRecordingContainer(join(box('ftyp', 8), box('mdat', 128), box('moov', 8)), 'm4a'))
      .toMatchObject({ mediaBytes: 128, status: 'valid' });
    expect(inspectRecordingContainer(join(box('ftyp', 8), box('moov', 8)), 'm4a').status).toBe('incomplete');
    expect(inspectRecordingContainer(join(box('free', 8), box('mdat', 128), box('moov', 8)), 'm4a').status).toBe('invalid');
  });

  it('requires a complete WAV header and non-empty data chunk', () => {
    expect(inspectRecordingContainer(wave(128), 'wav')).toMatchObject({ mediaBytes: 128, status: 'valid' });
    expect(inspectRecordingContainer(wave(0), 'wav').status).toBe('incomplete');
    expect(inspectRecordingContainer(new Uint8Array(64), 'wav').status).toBe('invalid');
  });
});
