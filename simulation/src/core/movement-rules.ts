/** Pure domain rules: no ECS or I/O dependencies. */
export type MoveRejection =
  | 'unknown_actor'
  | 'not_character'
  | 'unknown_destination'
  | 'not_room'
  | 'no_location'
  | 'already_there'
  | 'no_passage';

export interface MovementFacts {
  actorExists: boolean;
  isCharacter: boolean;
  destinationExists: boolean;
  destinationIsRoom: boolean;
  currentRoom: number | null;
  destination: number;
  hasPassage: boolean;
}

export function validateMovement(facts: MovementFacts): MoveRejection | null {
  if (!facts.actorExists) return 'unknown_actor';
  if (!facts.isCharacter) return 'not_character';
  if (!facts.destinationExists) return 'unknown_destination';
  if (!facts.destinationIsRoom) return 'not_room';
  if (facts.currentRoom === null) return 'no_location';
  if (facts.currentRoom === facts.destination) return 'already_there';
  if (!facts.hasPassage) return 'no_passage';
  return null;
}
