import { CLASSES } from './style';

const DURATION_MS = 6000;

let current: { el: HTMLElement; timer: number } | null = null;

function dismiss(): void {
  if (!current) return;
  clearTimeout(current.timer);
  current.el.remove();
  current = null;
}

export function showToast(message: string, action?: { label: string; run: () => void }): void {
  dismiss();
  const el = document.createElement('div');
  el.className = CLASSES.toast;
  el.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      dismiss();
      action.run();
    });
    el.append(button);
  }
  document.body.append(el);
  current = { el, timer: window.setTimeout(dismiss, DURATION_MS) };
}
