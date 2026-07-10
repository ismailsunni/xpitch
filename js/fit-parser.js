/*
 * fit-parser.js — self-contained FIT file decoder (browser, no dependencies).
 *
 * Decodes the Garmin/ANT+ FIT binary format enough to extract activity data:
 * file header, definition messages, data messages (incl. compressed-timestamp
 * headers and developer fields), semicircle->degree conversion and the common
 * scale/offset transforms for the `record` message.
 *
 * Usage:
 *   const result = FitParser.parse(arrayBuffer);
 *   result.records  -> [{timestamp, position_lat, position_long, speed, heart_rate, ...}, ...]
 *   result.sessions, result.laps, result.activity, result.events
 */
(function (global) {
  'use strict';

  // FIT epoch is 1989-12-31T00:00:00Z, expressed as a Unix timestamp (seconds).
  const FIT_EPOCH_OFFSET = 631065600;
  const SEMI_TO_DEG = 180 / Math.pow(2, 31);

  // base type number -> { size (bytes), invalid value, reader name }
  const BASE_TYPES = {
    0x00: { size: 1, name: 'enum', invalid: 0xff },
    0x01: { size: 1, name: 'sint8', invalid: 0x7f },
    0x02: { size: 1, name: 'uint8', invalid: 0xff },
    0x83: { size: 2, name: 'sint16', invalid: 0x7fff },
    0x84: { size: 2, name: 'uint16', invalid: 0xffff },
    0x85: { size: 4, name: 'sint32', invalid: 0x7fffffff },
    0x86: { size: 4, name: 'uint32', invalid: 0xffffffff },
    0x07: { size: 1, name: 'string', invalid: 0x00 },
    0x88: { size: 4, name: 'float32', invalid: 0xffffffff },
    0x89: { size: 8, name: 'float64', invalid: 0xffffffffffffffff },
    0x0a: { size: 1, name: 'uint8z', invalid: 0x00 },
    0x8b: { size: 2, name: 'uint16z', invalid: 0x0000 },
    0x8c: { size: 4, name: 'uint32z', invalid: 0x00000000 },
    0x0d: { size: 1, name: 'byte', invalid: 0xff },
    0x8e: { size: 8, name: 'sint64', invalid: 0x7fffffffffffffff },
    0x8f: { size: 8, name: 'uint64', invalid: 0xffffffffffffffff },
    0x90: { size: 8, name: 'uint64z', invalid: 0x0000000000000000 },
  };

  // Global message numbers we care about.
  const MESG = {
    0: 'file_id',
    18: 'session',
    19: 'lap',
    20: 'record',
    21: 'event',
    23: 'device_info',
    34: 'activity',
    49: 'file_creator',
  };

  // Field profile for the `record` message: fieldNum -> {name, scale, offset}.
  // Values are decoded as (raw / scale) - offset.
  const RECORD_FIELDS = {
    253: { name: 'timestamp' },
    0: { name: 'position_lat', semicircle: true },
    1: { name: 'position_long', semicircle: true },
    2: { name: 'altitude', scale: 5, offset: 500 },
    3: { name: 'heart_rate' },
    4: { name: 'cadence' },
    5: { name: 'distance', scale: 100 },
    6: { name: 'speed', scale: 1000 },
    7: { name: 'power' },
    13: { name: 'temperature' },
    73: { name: 'enhanced_speed', scale: 1000 },
    78: { name: 'enhanced_altitude', scale: 5, offset: 500 },
    39: { name: 'vertical_oscillation', scale: 10 },
    41: { name: 'stance_time', scale: 10 },
  };

  const SESSION_FIELDS = {
    253: { name: 'timestamp' },
    2: { name: 'start_time' },
    5: { name: 'sport' },
    6: { name: 'sub_sport' },
    7: { name: 'total_elapsed_time', scale: 1000 },
    8: { name: 'total_timer_time', scale: 1000 },
    9: { name: 'total_distance', scale: 100 },
    14: { name: 'avg_speed', scale: 1000 },
    15: { name: 'max_speed', scale: 1000 },
    16: { name: 'avg_heart_rate' },
    17: { name: 'max_heart_rate' },
    11: { name: 'total_calories' },
  };

  function fitTimestampToDate(raw) {
    if (raw == null) return null;
    return new Date((raw + FIT_EPOCH_OFFSET) * 1000);
  }

  function readValue(view, offset, baseType, littleEndian) {
    switch (baseType.name) {
      case 'enum':
      case 'uint8':
      case 'uint8z':
      case 'byte':
        return view.getUint8(offset);
      case 'sint8':
        return view.getInt8(offset);
      case 'uint16':
      case 'uint16z':
        return view.getUint16(offset, littleEndian);
      case 'sint16':
        return view.getInt16(offset, littleEndian);
      case 'uint32':
      case 'uint32z':
        return view.getUint32(offset, littleEndian);
      case 'sint32':
        return view.getInt32(offset, littleEndian);
      case 'float32':
        return view.getFloat32(offset, littleEndian);
      case 'float64':
        return view.getFloat64(offset, littleEndian);
      case 'sint64':
        return Number(view.getBigInt64(offset, littleEndian));
      case 'uint64':
      case 'uint64z':
        return Number(view.getBigUint64(offset, littleEndian));
      default:
        return view.getUint8(offset);
    }
  }

  function parse(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const bytes = new Uint8Array(arrayBuffer);

    // ---- Header ----
    const headerSize = view.getUint8(0);
    if (headerSize !== 12 && headerSize !== 14) {
      throw new Error('Not a FIT file (unexpected header size ' + headerSize + ')');
    }
    const dataSize = view.getUint32(4, true);
    const magic = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (magic !== '.FIT') {
      throw new Error('Not a FIT file (missing .FIT signature)');
    }

    const dataStart = headerSize;
    const dataEnd = Math.min(dataStart + dataSize, arrayBuffer.byteLength - 2);

    // localMessageType -> definition
    const definitions = {};
    const out = {
      records: [],
      sessions: [],
      laps: [],
      events: [],
      activity: null,
      file_id: null,
      other: {},
    };

    let pos = dataStart;
    let lastTimestamp = null;

    while (pos < dataEnd) {
      const recordHeader = view.getUint8(pos);
      pos += 1;

      const isCompressed = (recordHeader & 0x80) !== 0;
      let localType;
      let isDefinition = false;
      let hasDevData = false;
      let timeOffset = null;

      if (isCompressed) {
        localType = (recordHeader >> 5) & 0x03;
        timeOffset = recordHeader & 0x1f;
      } else {
        isDefinition = (recordHeader & 0x40) !== 0;
        hasDevData = (recordHeader & 0x20) !== 0;
        localType = recordHeader & 0x0f;
      }

      if (isDefinition) {
        // Definition message.
        pos += 1; // reserved
        const architecture = view.getUint8(pos);
        pos += 1;
        const littleEndian = architecture === 0;
        const globalMsgNum = view.getUint16(pos, littleEndian);
        pos += 2;
        const numFields = view.getUint8(pos);
        pos += 1;

        const fields = [];
        for (let i = 0; i < numFields; i++) {
          const fieldDefNum = view.getUint8(pos);
          const size = view.getUint8(pos + 1);
          const baseTypeByte = view.getUint8(pos + 2);
          pos += 3;
          const baseType = BASE_TYPES[baseTypeByte] || BASE_TYPES[0x02];
          fields.push({ fieldDefNum, size, baseType });
        }

        const devFields = [];
        if (hasDevData) {
          const numDevFields = view.getUint8(pos);
          pos += 1;
          for (let i = 0; i < numDevFields; i++) {
            const fieldNum = view.getUint8(pos);
            const size = view.getUint8(pos + 1);
            // const devDataIndex = view.getUint8(pos + 2);
            pos += 3;
            devFields.push({ fieldNum, size });
          }
        }

        definitions[localType] = {
          globalMsgNum,
          littleEndian,
          fields,
          devFields,
        };
      } else {
        // Data message.
        const def = definitions[localType];
        if (!def) {
          // Unknown local type; we cannot know the length. Bail out gracefully.
          break;
        }
        const msg = decodeDataMessage(view, pos, def);
        pos += msg.bytesRead;

        const raw = msg.fields;

        if (isCompressed && timeOffset != null && lastTimestamp != null) {
          // Reconstruct absolute timestamp from 5-bit offset.
          let ts = (lastTimestamp & ~0x1f) + timeOffset;
          if (timeOffset < (lastTimestamp & 0x1f)) ts += 0x20;
          raw[253] = ts;
        }
        if (raw[253] != null) lastTimestamp = raw[253];

        dispatchMessage(out, def.globalMsgNum, raw);
      }
    }

    return out;
  }

  function decodeDataMessage(view, startPos, def) {
    let pos = startPos;
    const fields = {};

    for (const f of def.fields) {
      const value = decodeField(view, pos, f, def.littleEndian);
      if (value !== undefined) fields[f.fieldDefNum] = value;
      pos += f.size;
    }
    // Developer fields: skip bytes (kept simple; stored under 'dev_<n>').
    for (const f of def.devFields) {
      pos += f.size;
    }

    return { fields, bytesRead: pos - startPos };
  }

  function decodeField(view, pos, field, littleEndian) {
    const bt = field.baseType;
    if (bt.name === 'string') {
      let str = '';
      for (let i = 0; i < field.size; i++) {
        const c = view.getUint8(pos + i);
        if (c === 0) break;
        str += String.fromCharCode(c);
      }
      return str || undefined;
    }

    const count = Math.max(1, Math.floor(field.size / bt.size));
    if (count === 1) {
      const v = readValue(view, pos, bt, littleEndian);
      return v === bt.invalid ? undefined : v;
    }
    // Array field: return the first valid element (sufficient for our metrics).
    for (let i = 0; i < count; i++) {
      const v = readValue(view, pos + i * bt.size, bt, littleEndian);
      if (v !== bt.invalid) return v;
    }
    return undefined;
  }

  function applyProfile(raw, profileMap) {
    const obj = {};
    for (const key in raw) {
      const prof = profileMap[key];
      let value = raw[key];
      if (!prof) {
        obj['field_' + key] = value;
        continue;
      }
      if (value == null) continue;
      if (prof.semicircle) {
        value = value * SEMI_TO_DEG;
      } else if (prof.scale) {
        value = value / prof.scale - (prof.offset || 0);
      } else if (prof.offset) {
        value = value - prof.offset;
      }
      obj[prof.name] = value;
    }
    if (obj.timestamp != null) {
      obj.date = fitTimestampToDate(obj.timestamp);
    }
    if (obj.start_time != null) {
      obj.start_date = fitTimestampToDate(obj.start_time);
    }
    return obj;
  }

  function dispatchMessage(out, globalMsgNum, raw) {
    const name = MESG[globalMsgNum];
    if (name === 'record') {
      out.records.push(applyProfile(raw, RECORD_FIELDS));
    } else if (name === 'session') {
      out.sessions.push(applyProfile(raw, SESSION_FIELDS));
    } else if (name === 'lap') {
      out.laps.push(applyProfile(raw, SESSION_FIELDS));
    } else if (name === 'event') {
      out.events.push(applyProfile(raw, { 253: { name: 'timestamp' } }));
    } else if (name === 'activity') {
      out.activity = applyProfile(raw, { 253: { name: 'timestamp' } });
    } else if (name === 'file_id') {
      out.file_id = raw;
    } else {
      (out.other[globalMsgNum] = out.other[globalMsgNum] || []).push(raw);
    }
  }

  global.FitParser = { parse, fitTimestampToDate, FIT_EPOCH_OFFSET };
})(typeof window !== 'undefined' ? window : this);
