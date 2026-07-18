<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{ title: string; message: string; confirmLabel?: string; busy?: boolean }>(),
  { confirmLabel: 'Delete', busy: false }
);
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const dialog = ref<HTMLElement>();
let previousFocus: HTMLElement | null = null;

function dismiss() {
  if (!props.busy) emit('cancel');
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    dismiss();
    return;
  }
  if (event.key !== 'Tab' || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.addEventListener('keydown', onKeydown);
  void nextTick(() => dialog.value?.querySelector<HTMLElement>('[data-confirm]')?.focus());
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  previousFocus?.focus();
});
</script>

<template>
  <div class="confirm-overlay" @click.self="dismiss">
    <section ref="dialog" class="confirm-dialog card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <h2 id="confirm-title">{{ title }}</h2>
      <p id="confirm-message">{{ message }}</p>
      <footer>
        <button class="btn ghost" :disabled="busy" @click="dismiss">Cancel</button>
        <button data-confirm class="btn danger" :disabled="busy" @click="emit('confirm')">{{ busy ? 'Working…' : confirmLabel }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.confirm-overlay { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: 18px; background: rgba(4, 8, 14, .72); }
.confirm-dialog { width: min(430px, 100%); }
h2 { margin: 0; font-size: 18px; }
p { margin: 10px 0 20px; color: var(--muted); }
footer { display: flex; justify-content: flex-end; gap: 8px; }
</style>
