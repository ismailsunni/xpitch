<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { auth, isAdmin } from '../lib/auth';
import { deleteFieldCloud, deleteMatch, listAdminData, setMatchVisibility, setUserPrivilege } from '../lib/api';
import { fmtDur } from '../lib/format';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { userErrorMessage } from '../lib/errors';

const state = ref<'loading' | 'ready' | 'error'>('loading');
const err = ref('');
const profiles = ref<any[]>([]);
const matches = ref<any[]>([]);
const fields = ref<any[]>([]);
const savingId = ref('');
const pendingDelete = ref<{ kind: 'match' | 'field'; item: any; message: string } | null>(null);

const totalSessions = computed(() => matches.value.reduce((sum, m) => sum + (m.sessions?.length || 0), 0));

function title(m: any) {
  return m.title || m.location_label || 'Untitled match';
}
function owner(m: any) {
  return m._author?.username ? `@${m._author.username}` : m.owner_id?.slice(0, 8) || 'unknown';
}
function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}
function matchDuration(m: any) {
  const seconds = (m.sessions || []).reduce((sum: number, s: any) => sum + (s.duration_s || 0), 0);
  return fmtDur(seconds);
}
function isSystemField(field: any) {
  return !field.owner_id;
}

async function load() {
  if (!auth.ready) return;
  if (!isAdmin()) {
    state.value = 'error';
    err.value = 'Admin access is restricted to privileged accounts.';
    return;
  }
  state.value = 'loading';
  err.value = '';
  try {
    const data = await listAdminData();
    profiles.value = data.profiles;
    matches.value = data.matches;
    fields.value = data.fields;
    state.value = 'ready';
  } catch (e: any) {
    state.value = 'error';
    err.value = userErrorMessage(e, 'Could not load admin data. Try again.');
  }
}

async function changeVisibility(match: any, visibility: string) {
  savingId.value = match.id;
  try {
    await setMatchVisibility(match.id, visibility);
    match.visibility = visibility;
  } catch (e: any) {
    err.value = userErrorMessage(e, 'Could not update visibility. Try again.');
  } finally {
    savingId.value = '';
  }
}

async function changePrivilege(profile: any, level: 'user' | 'admin') {
  savingId.value = profile.id;
  try {
    await setUserPrivilege(profile.id, level);
    profile.privilege = level;
  } catch (e: any) {
    err.value = userErrorMessage(e, 'Could not update this role. Try again.');
  } finally {
    savingId.value = '';
  }
}

function requestRemoveMatch(match: any) {
  pendingDelete.value = { kind: 'match', item: match, message: `Delete "${title(match)}" and its FIT files? This cannot be undone.` };
}
async function removeMatch(match: any) {
  savingId.value = match.id;
  try {
    await deleteMatch(match);
    matches.value = matches.value.filter((m) => m.id !== match.id);
  } catch (e: any) {
    err.value = userErrorMessage(e, 'Could not delete match. Try again.');
  } finally {
    savingId.value = '';
  }
}

function requestRemoveField(field: any) {
  if (isSystemField(field)) return;
  pendingDelete.value = { kind: 'field', item: field, message: `Delete pitch "${field.name}"? Matches linked to it will keep their data but lose the pitch link.` };
}
async function removeField(field: any) {
  savingId.value = field.id;
  try {
    await deleteFieldCloud(field.id);
    fields.value = fields.value.filter((f) => f.id !== field.id);
  } catch (e: any) {
    err.value = userErrorMessage(e, 'Could not delete pitch. Try again.');
  } finally {
    savingId.value = '';
  }
}
async function confirmDelete() {
  const pending = pendingDelete.value;
  if (!pending) return;
  if (pending.kind === 'match') await removeMatch(pending.item);
  else await removeField(pending.item);
  pendingDelete.value = null;
}

onMounted(load);
</script>

<template>
  <main class="tabpane admin-page">
    <div class="admin-head">
      <div>
        <p class="eyebrow">Admin</p>
        <h1>Super controls</h1>
        <p class="hint">Restricted to privileged accounts. Use this for testing and data cleanup.</p>
      </div>
      <button class="btn ghost small" @click="load">Refresh</button>
    </div>

    <p v-if="state === 'loading'" class="empty">Loading admin data…</p>
    <p v-else-if="state === 'error'" class="error">{{ err }}</p>
    <template v-else>
      <div class="admin-stats">
        <div class="card"><span>Profiles</span><strong>{{ profiles.length }}</strong></div>
        <div class="card"><span>Matches</span><strong>{{ matches.length }}</strong></div>
        <div class="card"><span>Sessions</span><strong>{{ totalSessions }}</strong></div>
        <div class="card"><span>Pitches</span><strong>{{ fields.length }}</strong></div>
      </div>

      <section class="panel">
        <h3>Matches</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Match</th><th>Owner</th><th>When</th><th>Duration</th><th>Files</th><th>Visibility</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="m in matches" :key="m.id">
                <td><RouterLink :to="`/match/${m.short_id}`">{{ title(m) }}</RouterLink><small>{{ m.short_id }}</small></td>
                <td>{{ owner(m) }}</td>
                <td>{{ when(m.started_at || m.created_at) }}</td>
                <td>{{ matchDuration(m) }}</td>
                <td>{{ (m.file_names || []).length }}</td>
                <td>
                  <select :value="m.visibility" :disabled="savingId === m.id" @change="changeVisibility(m, ($event.target as HTMLSelectElement).value)">
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </td>
                <td><button class="btn ghost small danger" :disabled="savingId === m.id" @click="requestRemoveMatch(m)">Delete</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h3>Pitches</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Slug</th><th>Owner</th><th>Visibility</th><th></th></tr></thead>
            <tbody>
              <tr v-for="f in fields" :key="f.id">
                <td><RouterLink v-if="f.slug" :to="`/field/${f.slug}`">{{ f.name }}</RouterLink><span v-else>{{ f.name }}</span></td>
                <td>{{ f.slug || '—' }}</td>
                <td>{{ f.owner_id ? f.owner_id.slice(0, 8) : 'system' }}</td>
                <td>{{ f.visibility }}</td>
                <td>
                  <button
                    class="btn ghost small danger"
                    :disabled="savingId === f.id || isSystemField(f)"
                    :title="isSystemField(f) ? 'System pitches cannot be deleted here' : 'Delete pitch'"
                    @click="requestRemoveField(f)"
                  >Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h3>Profiles</h3>
        <div class="profile-grid">
          <article v-for="p in profiles" :key="p.id" class="profile-card card">
            <RouterLink :to="p.username ? `/${p.username}` : '/admin'">
              <strong>{{ p.display_name || p.username || p.id.slice(0, 8) }}</strong>
              <span>{{ p.username ? '@' + p.username : 'no username' }}</span>
              <small>{{ p.id }}</small>
            </RouterLink>
            <label>Role
              <select :value="p.privilege" :disabled="savingId === p.id" @change="changePrivilege(p, ($event.target as HTMLSelectElement).value as 'user' | 'admin')">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </article>
        </div>
      </section>
    </template>
    <ConfirmDialog
      v-if="pendingDelete"
      :title="pendingDelete.kind === 'match' ? 'Delete match?' : 'Delete pitch?'"
      :message="pendingDelete.message"
      :busy="!!savingId"
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />
  </main>
</template>

<style scoped>
.admin-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 18px;
}
.admin-head h1 {
  margin: 0;
}
.eyebrow {
  margin: 0 0 4px;
  font: 11px var(--font-mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}
.admin-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.admin-stats .card {
  display: grid;
  gap: 3px;
}
.admin-stats span,
td small,
.profile-card span,
.profile-card small {
  color: var(--muted);
}
.admin-stats strong {
  font: 700 30px var(--font-head);
}
.panel {
  margin-bottom: 18px;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
th,
td {
  text-align: left;
  padding: 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
td {
  color: var(--text);
}
td small {
  display: block;
  margin-top: 2px;
}
select {
  background: var(--bg-elev2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--ctl-radius);
  padding: 6px 8px;
}
.danger:hover {
  color: var(--danger);
  border-color: var(--danger);
}
.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.profile-card {
  display: grid;
  gap: 10px;
  color: inherit;
  text-decoration: none;
}
.profile-card a {
  display: grid;
  gap: 2px;
  color: inherit;
  text-decoration: none;
}
.profile-card label {
  display: grid;
  gap: 4px;
  font-size: 11px;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--muted);
}
</style>
