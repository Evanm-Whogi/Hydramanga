import { apiDelete, apiGet } from '@/lib/api';

export type NotificationType =
  | 'import_request_status'
  | 'comment_reply'
  | 'board_reply'
  | 'new_chapters';

export interface UserNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  linkUrl: string;
  imageUrl: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: UserNotification[];
  count: number;
}

export async function getNotifications(): Promise<NotificationsResponse> {
  return apiGet('/notifications') as Promise<NotificationsResponse>;
}

export async function dismissNotification(id: number): Promise<NotificationsResponse> {
  return apiDelete(`/notifications/${id}`) as Promise<NotificationsResponse>;
}

export async function clearAllNotifications(): Promise<NotificationsResponse> {
  return apiDelete('/notifications') as Promise<NotificationsResponse>;
}
