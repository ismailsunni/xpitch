<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <main class="tabpane help">
    <h2 style="margin-top: 0">How xPitch works</h2>
    <p class="lead">
      xPitch analyzes a <code>.fit</code> file recorded by a GPS watch or tracker during a football,
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

    <h3>2 · Get the <code>.fit</code> file</h3>
    <ul>
      <li><strong>Garmin</strong> — Garmin Connect (web) → open the activity → <em>⚙ / ⋯ → Export Original</em> → downloads a <code>.fit</code>.</li>
      <li><strong>Coros</strong> — COROS app → activity → <em>… → Export → Original / FIT</em>.</li>
      <li><strong>Polar</strong> — Polar Flow (web) → activity → <em>Export → FIT / Export session</em>.</li>
      <li><strong>Suunto</strong> — Suunto app / movescount → export original <code>.fit</code>.</li>
      <li><strong>Wahoo / others</strong> — most companion apps have “Export original / FIT”.</li>
      <li><strong>Apple Watch</strong> — the built-in Workout app doesn’t export <code>.fit</code>; record with an app that does (e.g. <em>HealthFit</em>, <em>WorkOutDoors</em>) and export FIT.</li>
      <li><strong>Strava</strong> — you can’t download the original <code>.fit</code> via Strava; direct Strava import is planned. For now use the file from your device app above.</li>
    </ul>

    <h3>3 · Analyze</h3>
    <p>
      Click <strong>Open .fit file(s)</strong> (top-right) or drop the file on the
      <RouterLink to="/analyze">Analyze</RouterLink> page. Upload several files at once — matches
      recorded close together are grouped into one match with multiple sessions (halves show as
      periods). No file? Use <strong>Load sample</strong>.
    </p>

    <h3>4 · Make it accurate</h3>
    <ul>
      <li><strong>Set the pitch</strong> — draw your field on the satellite map (📐 Set field). It fixes orientation and left/right, and is reused automatically next time.</li>
      <li><strong>Attack direction</strong> — hit the flip to match which end you attacked (per match &amp; half).</li>
      <li><strong>Format</strong> — futsal / mini-soccer / full is auto-detected; override if needed.</li>
      <li><strong>Your age</strong> — set your birth date in <RouterLink to="/settings">settings</RouterLink> and HR zones auto-use age &amp; max HR.</li>
    </ul>

    <h3>5 · Save &amp; share</h3>
    <p>
      <strong>Log in</strong> (Google or email link), then <strong>Save match</strong> — it gets a
      link at <code>/match/&lt;id&gt;</code> you can copy or share. Choose visibility (private /
      unlisted / public); public matches show on your profile and in the feed. Everything stays
      yours; nothing is posted anywhere unless you share the link.
    </p>

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
</style>
