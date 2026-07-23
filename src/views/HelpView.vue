<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { METRIC_SECTIONS } from '../lib/metrics';
</script>

<template>
  <main class="tabpane help">
    <h1 style="margin-top: 0">How xPitch works</h1>
    <p class="lead">
      xPitch analyzes FIT, GPX, or TCX activity files recorded by a GPS watch or tracker during a football,
      mini-soccer or futsal match — positional heatmaps, running &amp; sprint stats, heart-rate zones
      and football metrics — all in your browser. An account lets you save matches, get shareable
      links, reuse pitches and build a history.
    </p>

    <h3>1 · Record your match</h3>
    <p>
      Wear a GPS device and start an activity when the match kicks off (any sport mode works —
      “Run”, “Soccer”, “Other”). Record each match as its own activity, or one continuous recording —
      xPitch can split and group them. Higher GPS sample rate (1 s) gives better heatmaps.
    </p>

    <h3>2 · Export an activity file</h3>
    <ul>
      <li><strong>Garmin</strong> — Garmin Connect (web) → open the activity → <em>⚙ / ⋯ → Export Original</em> for FIT, or export GPX/TCX.</li>
      <li><strong>Coros / Polar / Suunto / Wahoo</strong> — export FIT when available; GPX or TCX also work.</li>
      <li><strong>Apple Watch</strong> — use an export app such as <em>HealthFit</em> or <em>WorkOutDoors</em> to create FIT, GPX, or TCX.</li>
      <li><strong>Strava</strong> — export GPX or TCX from the activity when available. Direct Strava import requires an API subscription and is not enabled.</li>
    </ul>

    <h3>3 · Analyze</h3>
    <p>
      Click <strong>Import activity file</strong> in the navigation, or drop the file on the
      <RouterLink to="/analyze">Analyze</RouterLink> page. Upload several files at once — matches
      recorded close together are grouped into one match with multiple sessions (halves show as
      periods). On Android, install xPitch and share a FIT, GPX, or TCX file directly from your
      file manager to open it here. No file? Use <strong>Load a real sample</strong>.
    </p>

    <h3>4 · Make it accurate</h3>
    <ul>
      <li><strong>Add a pitch</strong> — select a saved pitch or choose <strong>Create a pitch</strong> to draw it on the satellite map. It improves orientation and left/right accuracy, and is reused automatically next time.</li>
      <li><strong>Attack direction</strong> — hit the flip to match which end you attacked (per match &amp; half).</li>
      <li><strong>Format</strong> — futsal / mini-soccer / full is auto-detected; override if needed.</li>
      <li><strong>Your age</strong> — set your birth date in <RouterLink to="/settings">settings</RouterLink> and HR zones auto-use age &amp; max HR.</li>
    </ul>

    <h3>5 · Save &amp; share</h3>
    <p>
      <strong>Log in</strong> (Google or email link), then <strong>Save match</strong> — it gets a
      secure link at <code>/match/&lt;id&gt;?share=&lt;token&gt;</code> you can copy or share. Choose visibility (private /
      unlisted / public); public matches show on your profile and in the feed. Everything stays
      yours; nothing is posted anywhere unless you share the link.
    </p>

    <h3>6 · What the numbers mean</h3>
    <p>
      Every stat in the app has a small <span class="idot">i</span> you can hover for a quick
      definition. Here’s the full glossary:
    </p>
    <div class="glossary">
      <section v-for="sec in METRIC_SECTIONS" :key="sec.title" class="gsec">
        <h4>{{ sec.title }}</h4>
        <dl>
          <template v-for="m in sec.items" :key="m.key">
            <dt>{{ m.term }}</dt>
            <dd>{{ m.desc }}</dd>
          </template>
        </dl>
      </section>
    </div>

    <p class="hint" style="margin-top: 24px">
      Privacy: files are parsed in your browser. Saving uploads the file to your private storage;
      matches default to <em>unlisted</em>. GPS reveals real locations — keep sensitive matches
      private.
    </p>
  </main>
</template>

<style scoped>
.help {
  max-width: 720px;
}
.help .lead {
  color: var(--text);
  font-size: 15px;
}
.help h3 {
  margin: 22px 0 6px;
}
.help ul {
  padding-left: 20px;
  color: var(--muted);
}
.help li {
  margin: 5px 0;
}
.help p {
  color: var(--muted);
}
.help strong {
  color: var(--text);
}
.glossary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 8px 28px;
  margin-top: 10px;
}
.gsec h4 {
  margin: 12px 0 6px;
  font-size: 13px;
  color: var(--accent-ink);
}
.gsec dl {
  margin: 0;
}
.gsec dt {
  color: var(--text);
  font-weight: 600;
  font-size: 13.5px;
  margin-top: 8px;
}
.gsec dd {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.idot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  color: var(--muted2);
  font-size: 9px;
  font-weight: 700;
  font-style: italic;
}
</style>
