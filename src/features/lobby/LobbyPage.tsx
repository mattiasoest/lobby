import { Link } from 'react-router-dom';
import { ROOM_IDS } from '../../app/constants.ts';
import { AvatarSelector } from '../../components/UI/AvatarSelector.tsx';

export function LobbyPage() {
  return (
    <div className="lobby-grid">
      <h1>Select a room</h1>
      <div className="room-cards">
        {ROOM_IDS.map((id) => (
          <Link key={id} className="room-card" to={`/room/${id}`}>
            Room {id}
          </Link>
        ))}
      </div>
      <AvatarSelector />
    </div>
  );
}
