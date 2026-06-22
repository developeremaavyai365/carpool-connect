let onNotification = null;

export function setNotificationHandler(handler) {
  onNotification = handler;
}

export function notifyIncoming(notification) {
  onNotification?.(notification);
}
