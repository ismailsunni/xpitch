import { describe, expect, it } from 'vitest';
import { parse } from './fit-parser';

function u16(value: number) {
  return [value & 255, (value >> 8) & 255];
}
function u32(value: number) {
  return [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255];
}
function i32(value: number) {
  return u32(value >>> 0);
}
function fixture(): ArrayBuffer {
  const data = [
    // local 0 record definition: timestamp, latitude, HR, speed
    0x40, 0, 0, ...u16(20), 4, 253, 4, 0x86, 0, 4, 0x85, 3, 1, 0x02, 6, 2, 0x84,
    0, ...u32(1_000), ...i32(536_870_912), 151, ...u16(3_250),
    // local 1 session definition: timestamp, start time, sport
    0x41, 0, 0, ...u16(18), 3, 253, 4, 0x86, 2, 4, 0x86, 5, 1, 0x00,
    1, ...u32(1_020), ...u32(1_000), 7,
  ];
  const header = [14, 0x20, 0, 1, ...u32(data.length), 46, 70, 73, 84, 0, 0];
  return Uint8Array.from([...header, ...data, 0, 0]).buffer;
}

describe('FIT parser', () => {
  it('decodes core record and session fields from a FIT binary', () => {
    const result = parse(fixture());
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ timestamp: 1_000, position_lat: 45, heart_rate: 151, speed: 3.25 });
    expect(result.sessions[0]).toMatchObject({ timestamp: 1_020, start_time: 1_000, sport: 7 });
  });

  it('rejects an invalid FIT header', () => {
    expect(() => parse(new Uint8Array([12, 0, 0, 0, 0, 0, 0, 0, 70, 65, 75, 69]).buffer)).toThrow('Not a FIT file');
  });

  it('rejects truncated FIT data rather than returning a partial activity', () => {
    const bytes = new Uint8Array(fixture());
    expect(() => parse(bytes.slice(0, bytes.length - 3).buffer)).toThrow();
  });
});
