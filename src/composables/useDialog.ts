import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const focusable = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shared keyboard/focus behavior for the app's dismissible overlays.
export function useDialog(close: () => void) {
  const dialogRef = ref<HTMLElement>();
  let previousFocus: HTMLElement | null = null;

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.value) return;
    const elements = [...dialogRef.value.querySelectorAll<HTMLElement>(focusable)];
    if (!elements.length) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
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
    void nextTick(() => dialogRef.value?.querySelector<HTMLElement>('[autofocus], input, button, select, textarea')?.focus());
  });
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown);
    previousFocus?.focus();
  });

  return { dialogRef };
}
