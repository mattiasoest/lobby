export type PlayerDTO = {
  id: string;
  username: string;
  /** World pixel coords (top-left of avatar quad in room space) */
  x: number;
  y: number;
  userId: string;
  /** Packed RGB for PIXI avatar fill (0xRRGGBB), chosen by client and echoed by server */
  color: number;
};

export type ChatMessageDTO = {
  id: string;
  room_id: number;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
};
