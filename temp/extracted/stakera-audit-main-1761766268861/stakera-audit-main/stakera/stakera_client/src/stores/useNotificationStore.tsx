import create, { State } from "zustand";
import produce from "immer";

interface Notification {
  type: string;
  message: string;
  description?: string;
  txid?: string;
  id: string;
}

interface NotificationStore extends State {
  notifications: Notification[];
  set: (fn: (state: NotificationStore) => void) => void;
  addOrUpdateNotification: (notification: Notification) => void;
}

const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  set: (fn) => set(produce(fn)),
  addOrUpdateNotification: (notification) =>
    set(
      produce((state: NotificationStore) => {
        const index = state.notifications.findIndex(
          (n) => n.id === notification.id
        );
        if (index !== -1) {
          state.notifications[index] = notification;
        } else {
          state.notifications.push(notification);
        }
      })
    ),
}));

export default useNotificationStore;
