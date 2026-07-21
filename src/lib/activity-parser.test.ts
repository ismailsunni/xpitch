import { describe, expect, it } from 'vitest';
import { parseActivityFile, parseGpx, parseTcx } from './activity-parser';

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk><name>Training</name><trkseg>
    <trkpt lat="-7.7750" lon="110.3750"><ele>120</ele><time>2026-07-19T08:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>142</gpxtpx:hr><gpxtpx:cad>88</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>
    <trkpt lat="-7.7751" lon="110.3752"><ele>121</ele><time>2026-07-19T08:00:10Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>151</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>
  </trkseg></trk>
</gpx>`;

const TCX = `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities><Activity Sport="Running"><Id>2026-07-19T08:00:00Z</Id><Lap StartTime="2026-07-19T08:00:00Z"><TotalTimeSeconds>10</TotalTimeSeconds><DistanceMeters>32</DistanceMeters><Track>
    <Trackpoint><Time>2026-07-19T08:00:00Z</Time><Position><LatitudeDegrees>-7.7750</LatitudeDegrees><LongitudeDegrees>110.3750</LongitudeDegrees></Position><AltitudeMeters>120</AltitudeMeters><DistanceMeters>0</DistanceMeters><HeartRateBpm><Value>142</Value></HeartRateBpm><Cadence>88</Cadence><Extensions><ns3:TPX><ns3:Speed>2.8</ns3:Speed><ns3:Watts>180</ns3:Watts></ns3:TPX></Extensions></Trackpoint>
    <Trackpoint><Time>2026-07-19T08:00:10Z</Time><Position><LatitudeDegrees>-7.7751</LatitudeDegrees><LongitudeDegrees>110.3752</LongitudeDegrees></Position><DistanceMeters>32</DistanceMeters><HeartRateBpm><Value>151</Value></HeartRateBpm></Trackpoint>
  </Track></Lap></Activity></Activities>
</TrainingCenterDatabase>`;

describe('GPX and TCX activity parsing', () => {
  it('normalizes GPX GPS and extension sensors into match records', () => {
    const result = parseGpx(GPX);
    expect(result.records).toHaveLength(2);
    expect(result.sessions).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ position_lat: -7.775, position_long: 110.375, altitude: 120, heart_rate: 142, cadence: 88 });
    expect(result.records[1].timestamp! - result.records[0].timestamp!).toBe(10);
  });

  it('normalizes TCX tracks, laps, and sensor extensions', () => {
    const result = parseTcx(TCX);
    expect(result.records).toHaveLength(2);
    expect(result.sessions).toHaveLength(1);
    expect(result.laps).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ distance: 0, heart_rate: 142, cadence: 88, speed: 2.8, power: 180 });
  });

  it('selects a parser from the uploaded file extension', () => {
    const bytes = new TextEncoder().encode(GPX).buffer;
    expect(parseActivityFile(bytes, 'football.gpx').records).toHaveLength(2);
    expect(() => parseActivityFile(bytes, 'football.csv')).toThrow('Unsupported file type');
  });
});
