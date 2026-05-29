import { Navigate, useParams } from 'react-router-dom';
import { isRoomId } from '../../app/constants.ts';
import { RoomPage } from './RoomPage.tsx';

export function RoomRouteGate() {
  const { roomId } = useParams<{ roomId: string }>();
  const id = Number(roomId);
  if (!isRoomId(id)) return <Navigate to="/lobby" replace />;
  return <RoomPage roomId={id} />;
}
