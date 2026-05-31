export type PlayerDTO = {
  id: string;
  username: string;
  /** World pixel coords (top-left of avatar quad in room space) */
  x: number;
  y: number;
  userId: string;
  /** Game avatar id, persisted server-side and echoed on the roster */
  avatarId: string;
};
