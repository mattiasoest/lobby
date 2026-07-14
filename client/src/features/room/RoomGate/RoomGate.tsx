import { Navigate, useParams } from 'react-router-dom';
import { isRoomId } from '@shared/rooms';
import { RoomPage } from '../RoomPage/RoomPage.tsx';

export function RoomRouteGate() {
  const { roomId } = useParams<{ roomId: string }>();
  const id = Number(roomId);
  if (!isRoomId(id)) return <Navigate to="/lobby" replace />;
  return <RoomPage roomId={id} />;
}
