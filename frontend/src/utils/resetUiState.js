/** Clear scroll locks and overlays left by modals after sign-out or auth redirect. */
export function resetUiAfterLogout() {
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.touchAction = '';
  document.documentElement.style.overflow = '';

  document.querySelectorAll('.location-picker-overlay, .map-picker-overlay').forEach((el) => {
    el.remove();
  });
}
