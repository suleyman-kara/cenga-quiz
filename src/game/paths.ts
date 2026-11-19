/** RTDB paths, mirroring the map in shared/types.ts. */
export const gamePath = (pin: string) => `games/${pin}`;
export const paths = {
  meta: (pin: string) => `${gamePath(pin)}/meta`,
  state: (pin: string) => `${gamePath(pin)}/state`,
  question: (pin: string) => `${gamePath(pin)}/question`,
  reveal: (pin: string) => `${gamePath(pin)}/reveal`,
  players: (pin: string) => `${gamePath(pin)}/players`,
  player: (pin: string, uid: string) => `${gamePath(pin)}/players/${uid}`,
  answers: (pin: string, qIndex: number) => `${gamePath(pin)}/answers/${qIndex}`,
  answer: (pin: string, qIndex: number, uid: string) => `${gamePath(pin)}/answers/${qIndex}/${uid}`,
  score: (pin: string, uid: string) => `${gamePath(pin)}/scores/${uid}`,
  leaderboard: (pin: string) => `${gamePath(pin)}/leaderboard`,
};
