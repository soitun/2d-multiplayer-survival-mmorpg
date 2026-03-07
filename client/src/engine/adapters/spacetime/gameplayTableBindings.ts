import type { GameplayTableBindings } from './gameplayConnectionSetup';

type GameplayTableBindingGroup = Partial<GameplayTableBindings>;

export interface GameplayTableBindingGroups {
  progression: GameplayTableBindingGroup;
  structures: GameplayTableBindingGroup;
  items: GameplayTableBindingGroup;
  world: GameplayTableBindingGroup;
  combat: GameplayTableBindingGroup;
  social: GameplayTableBindingGroup;
}

export function composeGameplayTableBindings(
  groups: GameplayTableBindingGroups,
): GameplayTableBindings {
  return {
    ...groups.progression,
    ...groups.structures,
    ...groups.items,
    ...groups.world,
    ...groups.combat,
    ...groups.social,
  } as GameplayTableBindings;
}
