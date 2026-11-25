export function planOversizedLeaders(players, seed) {
  const leaders = new Set(players.flatMap(player => player.leaders));
  if (players.length <= leaders.size) return [];
  const uses = new Map();
  for (const player of players) {
    if (player.leader !== 'RANDOM') uses.set(player.leader, (uses.get(player.leader) || 0) + 1);
  }
  const hash = value => {
    let result = 2166136261;
    for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
    return result >>> 0;
  };
  const assignments = [];
  for (const player of players) {
    if (player.leader !== 'RANDOM') continue;
    if (!player.leaders.length) throw new Error(`No available leaders for player ${player.id}`);
    const choices = [...player.leaders].sort((a, b) =>
      (uses.get(a) || 0) - (uses.get(b) || 0) ||
      hash(`${seed}:${player.id}:${a}`) - hash(`${seed}:${player.id}:${b}`) ||
      (a < b ? -1 : a > b ? 1 : 0));
    const leader = choices[0];
    assignments.push({ id: player.id, leader });
    uses.set(leader, (uses.get(leader) || 0) + 1);
  }
  return assignments;
}

function resolveOversizedLeaders() {
  if (UI.isInGame()) return;
  const players = [];
  for (let id = 0; id < Configuration.getMap().maxMajorPlayers; id++) {
    const player = Configuration.getPlayer(id);
    if (player.slotStatus !== SlotStatus.SS_TAKEN && player.slotStatus !== SlotStatus.SS_COMPUTER) continue;
    const parameter = GameSetup.findPlayerParameter(id, 'PlayerLeader');
    if (!parameter?.domain.possibleValues) throw new Error(`Missing leader options for player ${id}`);
    players.push({
      id, leader: String(parameter.value.value),
      leaders: parameter.domain.possibleValues
        .filter(value => value.invalidReason === GameSetupDomainValueInvalidReason.Valid &&
          String(value.value).startsWith('LEADER_'))
        .map(value => String(value.value)),
    });
  }
  const seed = GameSetup.findGameParameter('GameRandomSeed')?.value.value;
  const assignments = planOversizedLeaders(players, String(seed));
  if (!assignments.length) return;
  console.warn(`[ANTHROPROCENIA] Resolving ${assignments.length} random leaders for ${players.length} players; leaders repeat only after exhausting the available pool.`);
  for (const assignment of assignments) {
    GameSetup.setPlayerParameterValue(assignment.id, 'PlayerLeader', assignment.leader);
    const selected = GameSetup.findPlayerParameter(assignment.id, 'PlayerLeader')?.value.value;
    if (String(selected) !== assignment.leader) throw new Error(`Leader assignment rejected for player ${assignment.id}`);
  }
}

const engineCall = engine.call;
engine.call = function (method, ...args) {
  if (method === 'startGame') resolveOversizedLeaders();
  return engineCall.call(this, method, ...args);
};
const startNetworkGame = Network.startGame;
Network.startGame = function (...args) {
  if (Network.getHostPlayerId() === GameContext.localPlayerID) resolveOversizedLeaders();
  return startNetworkGame.apply(this, args);
};
