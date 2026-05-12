import type { PlayerDTO } from '../../types.ts';

export function PlayerList({ players }: { players: PlayerDTO[] }) {
  return (
    <aside className="player-list">
      <h3>In room ({players.length})</h3>
      <ul>
        {players.map((player) => (
          <li key={player.id}>
            {player.username}{' '}
            <small className="muted">
              ({Math.round(player.x)}, {Math.round(player.y)})
            </small>
          </li>
        ))}
      </ul>
    </aside>
  );
}
