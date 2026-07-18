<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../../store';
import ChartPanel from '../ChartPanel.vue';
import RoleCard from '../RoleCard.vue';
import InfoTip from '../InfoTip.vue';
import { speedProfileConfig } from '../../lib/charts';
import { fmtDur, fmtDist, kmh } from '../../lib/format';
import { deriveRating, deriveHighlights } from '../../lib/rating';
import { METRICS } from '../../lib/metrics';

const a = computed<any>(() => store.analytics);
const s = computed(() => a.value.summary);
const chart = computed(() => speedProfileConfig(a.value.samples));

const rating = computed(() => deriveRating(a.value));
const highlights = computed(() => deriveHighlights(a.value));

// Distance-by-intensity: real speed zones, bar width = share of total distance.
const zones = computed(() => {
  const zs = a.value.running?.zones || [];
  const total = zs.reduce((t: number, z: any) => t + z.distance, 0) || 1;
  return zs
    .filter((z: any) => z.distance > 0)
    .map((z: any) => ({ name: z.name, color: z.color, dist: z.distance, pct: (z.distance / total) * 100 }));
});

// % of the pitch grid the player occupied (only when positional data exists).
const coverage = computed(() => {
  const p = a.value.positional;
  if (!p?.grid) return null;
  let occupied = 0;
  let cells = 0;
  for (const row of p.grid) for (const c of row) { cells++; if (c > 0) occupied++; }
  return cells ? Math.round((occupied / cells) * 100) : null;
});

function openHeatmap() {
  store.activeTab = 'positional';
}
</script>

<template>
  <section class="tabpane">
    <!-- Row 1: report card + playing role/coverage -->
    <div class="ov-top">
      <div class="report">
        <div class="report-glow"></div>
        <div class="report-kicker">Match rating<InfoTip :text="METRICS.rating.desc" /></div>
        <div class="report-hero">
          <div class="grade">{{ rating.grade }}</div>
          <div>
            <div class="report-title">{{ rating.title }}</div>
            <div class="report-blurb">{{ rating.blurb }}</div>
          </div>
        </div>
        <div class="report-scores">
          <div><div class="rs-val">{{ rating.workRate }}<small>/100</small></div><div class="rs-k">Work rate<InfoTip :text="METRICS.workRate.desc" /></div></div>
          <div><div class="rs-val">{{ rating.intensity }}<small>/100</small></div><div class="rs-k">Intensity<InfoTip :text="METRICS.intensity.desc" /></div></div>
          <div><div class="rs-val">{{ rating.endurance }}<small>/100</small></div><div class="rs-k">Endurance<InfoTip :text="METRICS.endurance.desc" /></div></div>
          <div><div class="rs-val" style="color: var(--accent-ink)">{{ rating.score }}<small>/100</small></div><div class="rs-k">Overall</div></div>
        </div>
      </div>

      <div class="coverage card">
        <div class="cov-head">
          <div class="cov-title">Playing role &amp; coverage<InfoTip :text="METRICS.coverage.desc" /></div>
          <a v-if="coverage != null" class="cov-link" @click="openHeatmap">Open heatmap →</a>
        </div>
        <RoleCard :role="a.football.role" />
        <div v-if="coverage != null" class="cov-big">{{ coverage }}<span>%</span></div>
        <div v-if="coverage != null" class="cov-sub">of the pitch occupied</div>
        <div v-else class="cov-sub">Set a pitch to see spatial coverage.</div>
      </div>
    </div>

    <!-- Row 2: key tiles -->
    <div class="tiles">
      <div class="tile">
        <div class="tile-k">Total distance<InfoTip :text="METRICS.totalDistance.desc" /></div>
        <div class="tile-v">{{ fmtDist(s.totalDistance) }}</div>
        <div class="tile-s">over {{ fmtDur(s.durationS) }}</div>
      </div>
      <div class="tile">
        <div class="tile-k">Top speed<InfoTip :text="METRICS.topSpeed.desc" /></div>
        <div class="tile-v">{{ kmh(s.topSpeed) }} <small>km/h</small></div>
        <div class="tile-s">avg {{ kmh(s.avgSpeedMoving) }} km/h moving</div>
      </div>
      <div class="tile">
        <div class="tile-k">Sprints<InfoTip :text="METRICS.sprints.desc" /></div>
        <div class="tile-v">{{ a.running.sprints.length }}</div>
        <div class="tile-s">{{ a.running.highIntensityRuns.length }} high-intensity runs</div>
      </div>
      <div class="tile" v-if="a.physio">
        <div class="tile-k">Avg heart rate<InfoTip :text="METRICS.avgHR.desc" /></div>
        <div class="tile-v" style="color: var(--c-coral)">{{ a.physio.avgHR }} <small>bpm</small></div>
        <div class="tile-s">peak {{ a.physio.maxHR }} bpm</div>
      </div>
      <div class="tile" v-else>
        <div class="tile-k">Moving time<InfoTip :text="METRICS.movingTime.desc" /></div>
        <div class="tile-v">{{ fmtDur(s.movingTime) }}</div>
        <div class="tile-s">of {{ fmtDur(s.durationS) }}</div>
      </div>
    </div>

    <!-- Row 3: distance by intensity + highlights -->
    <div class="ov-split">
      <div class="card">
        <div class="card-title">Distance by intensity<InfoTip :text="METRICS.speedZones.desc" /></div>
        <div class="bars">
          <div class="bar-row" v-for="z in zones" :key="z.name">
            <div class="bl"><span>{{ z.name }}</span><span class="mono">{{ fmtDist(z.dist) }}</span></div>
            <div class="track"><div class="fill" :style="{ width: z.pct + '%', background: z.color }"></div></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Match highlights</div>
        <div v-if="highlights.length" class="hl-list">
          <div class="hl" v-for="(h, i) in highlights" :key="i">
            <div class="hl-min" :style="{ color: h.color }">{{ h.minute }}</div>
            <div class="hl-body"><b>{{ h.title }}</b> — {{ h.detail }}</div>
          </div>
        </div>
        <p v-else class="empty">Not enough sprint data for highlights.</p>
      </div>
    </div>

    <div class="panel">
      <h3>Speed profile</h3>
      <ChartPanel :config="chart" />
    </div>

  </section>
</template>

<style scoped>
.tabpane {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.card-title {
  font-family: var(--font-head);
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}
.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

/* Row 1 */
.ov-top {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 18px;
}
.report {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  padding: 24px 26px;
  background: var(--report-grad);
  border: 1px solid var(--accent-tint-strong);
  min-width: 0;
}
.report-glow {
  position: absolute;
  right: -40px;
  top: -40px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200, 247, 81, 0.16), transparent 68%);
  pointer-events: none;
}
.report-kicker {
  font-family: var(--font-mono);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}
.report-hero {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  margin-top: 12px;
  min-width: 0;
}
.grade {
  font-family: var(--font-head);
  font-weight: 700;
  font-size: 78px;
  line-height: 0.9;
  color: var(--accent-ink);
  letter-spacing: -0.03em;
}
.report-title {
  font-family: var(--font-head);
  font-size: 21px;
  font-weight: 600;
  min-width: 0;
}
.report-blurb {
  font-size: 13px;
  color: var(--muted);
  margin-top: 4px;
  max-width: 340px;
  line-height: 1.5;
}
.report-scores {
  display: flex;
  gap: 26px;
  flex-wrap: wrap;
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
.rs-val {
  font-family: var(--font-head);
  font-size: 22px;
  font-weight: 700;
}
.rs-val small {
  font-size: 12px;
  color: var(--dim);
}
.rs-k {
  font-size: 11.5px;
  color: var(--muted2);
  margin-top: 2px;
}

.coverage {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.cov-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.cov-title {
  font-family: var(--font-head);
  font-size: 15px;
  font-weight: 600;
}
.cov-link {
  font-size: 12px;
  color: var(--accent-ink);
  cursor: pointer;
}
.coverage :deep(.role-hero) { margin-top: 2px; }
.coverage :deep(.role-badge) { font-size: 18px; }
.coverage :deep(.role-rank) { margin-top: 10px; }
.coverage :deep(.hint) { margin: 10px 0 0; font-size: 12px; }
.cov-big {
  font-family: var(--font-head);
  font-size: 46px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-top: auto;
}
.cov-big span {
  font-size: 20px;
  color: var(--dim);
}
.cov-sub {
  font-size: 12px;
  color: var(--muted2);
  margin-top: 2px;
}

/* Row 2 tiles */
.tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.tile {
  border-radius: 16px;
  padding: 18px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  min-width: 0;
}
.tile-k {
  color: var(--muted2);
  font-size: 12px;
}
.tile-v {
  font-family: var(--font-head);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-top: 10px;
}
.tile-v small {
  font-size: 14px;
  color: var(--dim);
  font-weight: 500;
}
.tile-s {
  font-size: 11.5px;
  color: var(--muted2);
  margin-top: 4px;
}

/* Row 3 */
.ov-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.bars {
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.bar-row .bl {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
  margin-bottom: 5px;
  color: #9fb0a6;
}
.track {
  height: 8px;
  border-radius: 5px;
  background: var(--bg-elev3);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 5px;
}
.hl-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hl {
  display: flex;
  gap: 12px;
  align-items: center;
}
.hl-min {
  width: 42px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  flex: none;
}
.hl-body {
  flex: 1;
  padding: 10px 13px;
  border-radius: 10px;
  background: var(--bg-elev3);
  font-size: 13px;
}

@media (max-width: 760px) {
  .ov-top,
  .ov-split {
    grid-template-columns: 1fr;
  }
  .tiles {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 520px) {
  .report {
    padding: 18px;
    border-radius: 16px;
  }
  .report-hero {
    align-items: flex-start;
    gap: 12px;
  }
  .grade {
    font-size: 58px;
    flex: none;
  }
  .report-title {
    font-size: 18px;
    line-height: 1.15;
  }
  .report-blurb {
    font-size: 12.5px;
  }
  .report-scores {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 18px;
  }
  .tiles {
    grid-template-columns: 1fr;
  }
  .tile-v {
    font-size: 26px;
  }
  .cov-head,
  .hl {
    align-items: flex-start;
  }
  .cov-head {
    gap: 8px;
    flex-direction: column;
  }
  .hl-body {
    min-width: 0;
  }
}
</style>
