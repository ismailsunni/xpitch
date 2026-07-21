import { XMLParser } from 'fast-xml-parser';
import { dateToFitTimestamp, parse as parseFit } from './fit-parser';
import type { FitResult, RecordSample, SessionMessage } from './fit-parser';

type XmlNode = Record<string, unknown>;

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

function array<T>(value: T | T[] | null | undefined): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}

function node(value: unknown): XmlNode {
  return value && typeof value === 'object' ? value as XmlNode : {};
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const text = node(value)['#text'];
  return text === undefined ? undefined : numberValue(text);
}

function childNumber(parent: XmlNode, key: string): number | undefined {
  return numberValue(parent[key]);
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function finishSession(records: RecordSample[], start: number, sport = 'running'): SessionMessage {
  const end = records[records.length - 1]?.timestamp ?? start;
  return {
    start_time: start,
    timestamp: end,
    start_date: new Date((start + 631065600) * 1000),
    date: new Date((end + 631065600) * 1000),
    sport,
    total_elapsed_time: Math.max(0, end - start),
    total_timer_time: Math.max(0, end - start),
    total_distance: records[records.length - 1]?.distance,
  };
}

function extensionValue(parent: XmlNode, key: string): number | undefined {
  const extensions = node(parent.extensions);
  for (const value of Object.values(extensions)) {
    const candidate = childNumber(node(value), key);
    if (candidate != null) return candidate;
    for (const nested of Object.values(node(value))) {
      const nestedCandidate = childNumber(node(nested), key);
      if (nestedCandidate != null) return nestedCandidate;
    }
  }
  return undefined;
}

export function parseGpx(text: string): FitResult {
  const root = node(xml.parse(text).gpx);
  const records: RecordSample[] = [];
  const sessions: SessionMessage[] = [];

  for (const track of array<XmlNode>(root.trk as XmlNode | XmlNode[])) {
    const trackRecords: RecordSample[] = [];
    for (const segment of array<XmlNode>(track.trkseg as XmlNode | XmlNode[])) {
      for (const point of array<XmlNode>(segment.trkpt as XmlNode | XmlNode[])) {
        const date = dateValue(point.time);
        const lat = numberValue(point['@_lat']);
        const lon = numberValue(point['@_lon']);
        if (!date || lat == null || lon == null) continue;
        const sample: RecordSample = {
          timestamp: dateToFitTimestamp(date),
          date,
          position_lat: lat,
          position_long: lon,
          altitude: childNumber(point, 'ele'),
          heart_rate: extensionValue(point, 'hr'),
          cadence: extensionValue(point, 'cad'),
          power: extensionValue(point, 'power'),
          speed: extensionValue(point, 'speed'),
        };
        trackRecords.push(sample);
      }
    }
    if (!trackRecords.length) continue;
    trackRecords.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    records.push(...trackRecords);
    sessions.push(finishSession(trackRecords, trackRecords[0].timestamp!, 'running'));
  }
  if (!records.length) throw new Error('No timestamped GPS track points found in this GPX file.');
  return { records, sessions, laps: [], events: [], activity: null, file_id: null, other: {} };
}

export function parseTcx(text: string): FitResult {
  const root = node(xml.parse(text).TrainingCenterDatabase);
  const activities = array<XmlNode>(node(root.Activities).Activity as XmlNode | XmlNode[]);
  const records: RecordSample[] = [];
  const sessions: SessionMessage[] = [];
  const laps: SessionMessage[] = [];

  for (const activity of activities) {
    const activityRecords: RecordSample[] = [];
    for (const lap of array<XmlNode>(activity.Lap as XmlNode | XmlNode[])) {
      const lapRecords: RecordSample[] = [];
      for (const track of array<XmlNode>(lap.Track as XmlNode | XmlNode[])) {
        for (const point of array<XmlNode>(track.Trackpoint as XmlNode | XmlNode[])) {
          const date = dateValue(point.Time);
          const position = node(point.Position);
          const lat = childNumber(position, 'LatitudeDegrees');
          const lon = childNumber(position, 'LongitudeDegrees');
          if (!date || lat == null || lon == null) continue;
          const tpx = node(node(point.Extensions).TPX);
          const sample: RecordSample = {
            timestamp: dateToFitTimestamp(date),
            date,
            position_lat: lat,
            position_long: lon,
            altitude: childNumber(point, 'AltitudeMeters'),
            distance: childNumber(point, 'DistanceMeters'),
            heart_rate: childNumber(node(point.HeartRateBpm), 'Value'),
            cadence: childNumber(point, 'Cadence') ?? childNumber(tpx, 'RunCadence'),
            speed: childNumber(tpx, 'Speed'),
            power: childNumber(tpx, 'Watts'),
          };
          lapRecords.push(sample);
          activityRecords.push(sample);
        }
      }
      if (lapRecords.length) {
        lapRecords.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        laps.push({
          ...finishSession(lapRecords, lapRecords[0].timestamp!, String(activity['@_Sport'] || 'running')),
          total_elapsed_time: childNumber(lap, 'TotalTimeSeconds') ?? undefined,
          total_distance: childNumber(lap, 'DistanceMeters') ?? lapRecords[lapRecords.length - 1].distance,
        });
      }
    }
    if (!activityRecords.length) continue;
    activityRecords.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    records.push(...activityRecords);
    sessions.push(finishSession(activityRecords, activityRecords[0].timestamp!, String(activity['@_Sport'] || 'running')));
  }
  if (!records.length) throw new Error('No timestamped GPS track points found in this TCX file.');
  return { records, sessions, laps, events: [], activity: null, file_id: null, other: {} };
}

export function isSupportedActivityFile(name: string): boolean {
  return /\.(fit|gpx|tcx)$/i.test(name);
}

export function parseActivityFile(bytes: ArrayBuffer, name: string): FitResult {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'fit') return parseFit(bytes);
  const text = new TextDecoder().decode(bytes);
  if (extension === 'gpx') return parseGpx(text);
  if (extension === 'tcx') return parseTcx(text);
  throw new Error('Unsupported file type. Choose a FIT, GPX, or TCX file.');
}
