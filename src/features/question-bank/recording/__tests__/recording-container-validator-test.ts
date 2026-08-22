import { inspectRecordingContainer } from '../recording-container-validator';

const REAL_ONE_SECOND_M4A = 'AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAAhmcmVlAAABJ21kYXTeAgBMYXZjNjEuMTkuMTAxAEIgCMEYOCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHAAAA65tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAD6AABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAC2XRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAD6AAAAAAAAAAAAAAAAQEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAA+gAAAQAAAEAAAAAAlFtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAKxEAACwRFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAAH8bWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAHAc3RibAAAAGpzdHNkAAAAAAAAAAEAAABabXA0YQAAAAAAAAABAAAAAAAAAAAAAgAQAAAAAKxEAAAAAAA2ZXNkcwAAAAADgICAJQABAASAgIAXQBUAAAAAAfQAAAAIwwWAgIAFEhBW5QAGgICAAQIAAAAgc3R0cwAAAAAAAAACAAAALAAABAAAAAABAAAARAAAABxzdHNjAAAAAAAAAAEAAAABAAAALQAAAAEAAADIc3RzegAAAAAAAAAAAAAALQAAABcAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAABRzdGNvAAAAAAAAAAEAAAAsAAAAGnNncGQBAAAAcm9sbAAAAAIAAAAB//8AAAAcc2JncAAAAAByb2xsAAAAAQAAAC0AAAABAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2MS43LjEwMA==';

const VALID_ONE_SECOND_M4A = [
  'AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAAhmcmVlAAABJ21kYXTeAgBMYXZjNjEuMTkuMTAx',
  'AEIgCMEYOCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCM',
  'HCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCM',
  'HCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCM',
  'HCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCM',
  'HCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHAAAA65tb292AAAAbG12aGQAAAAAAAAAAAAAAAAA',
  'AAPoAAAD6AABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAC2XRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEA',
  'AAAAAAAD6AAAAAAAAAAAAAAAAQEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAA',
  'AAAAAAAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAA+gAAAQAAAEAAAAAAlFtZGlhAAAAIG1kaGQA',
  'AAAAAAAAAAAAAAAAAKxEAACwRFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5k',
  'SGFuZGxlcgAAAAH8bWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAM',
  'dXJsIAAAAAEAAAHAc3RibAAAAGpzdHNkAAAAAAAAAAEAAABabXA0YQAAAAAAAAABAAAAAAAAAAAAAgAQ',
  'AAAAAKxEAAAAAAA2ZXNkcwAAAAADgICAJQABAASAgIAXQBUAAAAAAfQAAAAIwwWAgIAFEhBW5QAGgICA',
  'AQIAAAAgc3R0cwAAAAAAAAACAAAALAAABAAAAAABAAAARAAAABxzdHNjAAAAAAAAAAEAAAABAAAALQAA',
  'AAEAAADIc3RzegAAAAAAAAAAAAAALQAAABcAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAA',
  'AAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAA',
  'AAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAA',
  'AAYAAAAGAAAABgAAAAYAAAAGAAAABgAAABRzdGNvAAAAAAAAAAEAAAAsAAAAGnNncGQBAAAAcm9sbAAA',
  'AAIAAAAB//8AAAAcc2JncAAAAAByb2xsAAAAAQAAAC0AAAABAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAh',
  'aGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAA',
  'AExhdmY2MS43LjEwMA==',
].join('');

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function text(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}

function box(type: string, payloadBytes: number) {
  const bytes = new Uint8Array(8 + payloadBytes);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  text(bytes, 4, type);
  return bytes;
}

function boxWithPayload(type: string, payload: Uint8Array) {
  const bytes = box(type, payload.length);
  bytes.set(payload, 8);
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

function m4a(durationMs: number, mediaBytes = 128, includeAudioTrack = true) {
  const mdhdPayload = new Uint8Array(20);
  const mdhdView = new DataView(mdhdPayload.buffer);
  mdhdView.setUint32(12, 1_000);
  mdhdView.setUint32(16, durationMs);
  const hdlrPayload = new Uint8Array(12);
  text(hdlrPayload, 8, includeAudioTrack ? 'soun' : 'vide');
  const mdia = boxWithPayload('mdia', join(
    boxWithPayload('mdhd', mdhdPayload),
    boxWithPayload('hdlr', hdlrPayload),
  ));
  const moov = boxWithPayload('moov', boxWithPayload('trak', mdia));
  return join(box('ftyp', 8), box('mdat', mediaBytes), moov);
}

describe('recording container validator', () => {
  it('requires a timed audio track in addition to ftyp, moov, and non-empty mdat for M4A', () => {
    expect(inspectRecordingContainer(m4a(3_000), 'm4a'))
      .toMatchObject({ audioTrackCount: 1, mediaBytes: 128, mediaDurationMs: 3_000, status: 'valid' });
    expect(inspectRecordingContainer(m4a(3_000, 128, false), 'm4a').status).toBe('invalid');
    expect(inspectRecordingContainer(join(box('ftyp', 8), box('moov', 8)), 'm4a').status).toBe('incomplete');
    expect(inspectRecordingContainer(join(box('free', 8), box('mdat', 128), box('moov', 8)), 'm4a').status).toBe('invalid');
  });

  it('reads the audio-track duration from a real generated AAC/M4A fixture', () => {
    const bytes = decodeBase64(VALID_ONE_SECOND_M4A);
    const inspection = inspectRecordingContainer(bytes, 'm4a');
    expect(inspection).toMatchObject({ audioTrackCount: 1, status: 'valid' });
    expect(inspection.mediaDurationMs).toBeCloseTo(1_023.22, 1);
    expect(inspectRecordingContainer(
      decodeBase64(REAL_ONE_SECOND_M4A),
      'm4a',
    ).status).toBe('incomplete');
  });

  it('requires a complete WAV header and non-empty data chunk', () => {
    expect(inspectRecordingContainer(wave(32_000), 'wav'))
      .toMatchObject({ audioTrackCount: 1, mediaBytes: 32_000, mediaDurationMs: 1_000, status: 'valid' });
    expect(inspectRecordingContainer(wave(0), 'wav').status).toBe('incomplete');
    expect(inspectRecordingContainer(new Uint8Array(64), 'wav').status).toBe('invalid');
  });
});
