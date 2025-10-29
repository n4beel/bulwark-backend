import useNotificationStore from "../stores/useNotificationStore";
import { v4 as uuidv4 } from "uuid";

export function notify(newNotification: {
  type: string;
  message: string;
  description?: string;
  txid?: string;
  id?: string;
}) {
  const notificationId = newNotification.id || uuidv4(); // Generate a new ID if not provided

  useNotificationStore.getState().addOrUpdateNotification({
    ...newNotification,
    id: notificationId,
  });
}
