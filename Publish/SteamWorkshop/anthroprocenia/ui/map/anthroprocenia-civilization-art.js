import { UNIT_ART_DONORS, CIVILIZATION_BACKGROUNDS } from './anthroprocenia-unit-art.js';

const ADDITIONAL_UNIT_ART_DONORS = {
  UNIT_ANTHRO_LATCHED_REED_OARBOAT: 'UNIT_GALLEY',
  UNIT_ANTHRO_CLUBMAN: 'UNIT_WARRIOR',
  UNIT_ANTHRO_STONE_THROWER: 'UNIT_SLINGER',
  UNIT_ANTHRO_RAIDER: 'UNIT_SPEARMAN',
  UNIT_ANTHRO_HIGHWAYMEN: 'UNIT_SWORDSMAN',
  UNIT_ANTHRO_PARTISAN: 'UNIT_RIFLEMAN',
};

export function civilizationBackgroundTexture(texture) {
  if (typeof texture !== 'string') return texture;
  const match = /^(?:(?:blp:|fs:\/\/game\/))?bg-(?:panel|card)-(anthro_[a-z_]+)(?:\.png)?$/.exec(texture);
  return match && CIVILIZATION_BACKGROUNDS[match[1]] || texture;
}

export function syncCivilizationUnitPortrait(actions, unit, definitions, worldUI) {
  if (!actions || !unit) return;
  const definition = definitions.lookup(unit.type);
  const donor = UNIT_ART_DONORS[definition?.UnitType] || ADDITIONAL_UNIT_ART_DONORS[definition?.UnitType];
  const image = actions.component?.portraitImage;
  if (!donor || !image) return;
  const path = `url("live:/${donor}")`;
  if (image.style.backgroundImage === path) return;
  worldUI.requestPortrait(donor, donor, 'UnitPortraitsBG_UNIQUE');
  image.style.backgroundImage = path;
}
