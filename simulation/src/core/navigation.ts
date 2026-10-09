/**
 * Shortest route through rooms in a *known building map*. This contains no
 * character coordinates or private knowledge, only public structural exits.
 */
export function nextRoomOnRoute(
  start: number,
  goal: number,
  exits: (room: number) => readonly number[]
): number | null {
  if (start === goal) return null;
  const queue: number[] = [start];
  const cameFrom = new Map<number, number | null>([[start, null]]);
  for (let index = 0; index < queue.length; index++) {
    const room = queue[index]!;
    for (const neighbor of [...exits(room)].sort((a, b) => a - b)) {
      if (cameFrom.has(neighbor)) continue;
      cameFrom.set(neighbor, room);
      if (neighbor === goal) {
        let step = goal;
        while (cameFrom.get(step) !== start) {
          const previous = cameFrom.get(step);
          if (previous === undefined || previous === null) return null;
          step = previous;
        }
        return step;
      }
      queue.push(neighbor);
    }
  }
  return null;
}
