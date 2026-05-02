interface MovementBase {
  playerId: number;
  playerName: string;
  teamCode: string;
  matchId: string;
}

export interface InjuredRecord extends MovementBase {
  lastJersey: number;
  lastPosition: string;
  injury: string;
  expectedReturn: string;
}

export interface DroppedRecord extends MovementBase {
  lastJersey: number;
  lastPosition: string;
}

export interface BenchedRecord extends MovementBase {
  prevJersey: number;
  prevPosition: string;
  currentJersey: number;
  consecutiveRoundsBenched: number;
  replacedByPlayerId: number | null;
  replacedByPlayerName: string | null;
}

export interface PromotedRecord extends MovementBase {
  currentJersey: number;
  position: string;
  replacingPlayerId: number | null;
  replacingPlayerName: string | null;
}

export interface CoveringInjuryRecord extends MovementBase {
  currentJersey: number;
  currentPosition: string;
  prevJersey: number | null;
  prevPosition: string | null;
  coveringPlayerId: number;
  coveringPlayerName: string;
  coveringLastJersey: number;
  coveringLastPosition: string;
}

export interface ReturningFromInjuryRecord extends MovementBase {
  lastJersey: number;
  lastPosition: string;
  currentJersey: number;
  currentPosition: string;
  positionChanged: boolean;
}

export interface PositionChangedRecord extends MovementBase {
  oldPosition: string;
  newPosition: string;
  currentJersey: number;
}

export interface PlayerMovementsResult {
  pending: false;
  noPreviousRound?: boolean;
  season: number;
  round: number;
  injured: InjuredRecord[];
  dropped: DroppedRecord[];
  benched: BenchedRecord[];
  returningFromInjury: ReturningFromInjuryRecord[];
  coveringInjury: CoveringInjuryRecord[];
  promoted: PromotedRecord[];
  positionChanged: PositionChangedRecord[];
}

export type PlayerMovementsResponse = { pending: true } | PlayerMovementsResult;
