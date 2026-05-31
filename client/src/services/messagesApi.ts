import { apiFetch } from './api.ts';

export type ChatMessageDTO = {
  id: string;
  room_id: number;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
};

export function fetchRoomMessages(roomId: number, token: string): Promise<ChatMessageDTO[]> {
  return apiFetch(`/rooms/${roomId}/messages`, token);
}
