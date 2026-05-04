export type PlayerDTO = {
  id: string
  username: string
  x: number
  y: number
  userId: string
}

export type ChatMessageDTO = {
  id: string
  room_id: number
  user_id: string
  username: string
  content: string
  created_at: string
}
