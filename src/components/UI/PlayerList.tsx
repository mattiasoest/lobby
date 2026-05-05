import type { PlayerDTO } from '../../types.ts';

export function PlayerList({ players }: { players: PlayerDTO[] }) {
  return (
    <aside className="player-list">
      <h3>In room ({players.length})</h3>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            {p.username}{' '}
            <small>
              ({Math.round(p.x)}, {Math.round(p.y)})
            </small>
          </li>
        ))}
      </ul>
    </aside>
  );
}
