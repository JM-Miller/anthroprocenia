export const UNIT_DESTINATION_STYLES = {
  discoveries: { color: '#ffe06e', opacity: 0.3, label: 'Gold: discoveries' },
  religion: { color: '#28eebe', opacity: 0.45, label: 'Green: religion spread available' },
  trade: { color: '#00cd00', opacity: 1 / 3, label: 'Green: available trade territory' },
  roads: { color: '#28eebe', opacity: 0.45, label: 'Green: road connections' },
  settlements: { color: '#b49e28', opacity: 0.6, label: 'Yellow: legal settlement sites without freshwater' },
  freshwater: { color: '#28eebe', opacity: 0.45, label: 'Green: legal freshwater settlement sites' },
  blocked: { color: '#690909', opacity: 0.6, label: 'Red: settlement blocked' },
  tradeBlocked: { color: '#cd0000', opacity: 1 / 3, label: 'Red: unavailable trade territory' },
  operationAvailable: { color: '#28eebe', opacity: 0.45, label: 'Green: native action targets available' },
  operationBlocked: { color: '#690909', opacity: 0.6, label: 'Red: native action targets currently unavailable' },
};

export function unitDestinationGroups(options) {
  const steps = unitDestinationGroupSteps(options);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}
export function* unitDestinationGroupSteps({ unit, definition, lens, targets, continents, player, map, districts, constructibles, definitions, cities, success }) {
  const groups = Object.fromEntries(Object.keys(UNIT_DESTINATION_STYLES).map(key => [key, []]));
  const requireMethod = (object, method) => {
    if (!object || typeof object[method] !== 'function') throw new Error(`Unit destination highlights require ${method}.`);
  };
  const revealed = plot => {
    const location = map.getLocationFromIndex(plot);
    return map.getRevealedState(unit.owner, location.x, location.y) > 0;
  };
  if (definition.SpreadCharges > 0) {
    requireMethod(unit, 'getActivationOperationPlots');
    for (const plot of unit.getActivationOperationPlots('UNITOPERATION_SPREAD_RELIGION', false)) {
      yield;
      if (revealed(plot)) groups.religion.push(plot);
    }
  } else if (definition.MakeTradeRoute) {
    requireMethod(unit, 'getActivationPlots');
    requireMethod(player.Trade, 'projectPossibleTradeRoutes');
    for (const plot of unit.getActivationPlots('UNITCOMMAND_CONNECT_WITH_ROAD', false)) {
      yield;
      if (revealed(plot)) groups.roads.push(plot);
    }
    for (const route of player.Trade.projectPossibleTradeRoutes()) {
      yield;
      if (!route.status || !route.status.length) throw new Error('A projected trade-route status is unavailable.');
      const city = cities.get(route.targetCityId);
      if (!city) throw new Error('A projected trade-route destination city is unavailable.');
      requireMethod(city, 'getPurchasedPlots');
      const plots = city.getPurchasedPlots();
      for (const plot of plots.length ? plots : [map.getIndexFromLocation(city.location)]) {
        yield;
        if (revealed(plot)) groups[route.status[0] === success ? 'trade' : 'tradeBlocked'].push(plot);
      }
    }
  } else if (definition.FoundCity || lens === 'fxs-discovery-lens') {
    const scout = !definition.FoundCity;
    if (!scout) { requireMethod(player.Diplomacy, 'isValidLandClaimLocation'); requireMethod(map, 'isFreshWater'); requireMethod(map, 'isWater'); }
    const size = map.getGridWidth() * map.getGridHeight();
    for (let plot = 0; plot < size; plot++) {
      yield;
      if (!revealed(plot)) continue;
      const location = map.getLocationFromIndex(plot);
      if (!scout) {
        if (player.Diplomacy.isValidLandClaimLocation(location, true)) groups[map.isFreshWater(location.x, location.y) ? 'freshwater' : 'settlements'].push(plot);
        else if (!map.isWater(location.x, location.y)) groups.blocked.push(plot);
        continue;
      }
      const district = districts.getAtLocation(plot);
      if (!district || ![definitions.wilderness, definitions.rural].includes(district.type)) continue;
      for (const id of constructibles.getHiddenFilteredConstructibles(location.x, location.y)) {
        const constructible = definitions.getConstructible(id);
        if (!constructible) throw new Error('A revealed discovery constructible is unavailable.');
        const definition = definitions.lookupConstructible(constructible.type);
        if (!definition) throw new Error('A revealed discovery definition is unavailable.');
        if (definition.Discovery) { groups.discoveries.push(plot); break; }
      }
    }
  }
  if (targets) for (const plot of targets.plots) {
    yield;
    if (revealed(plot)) groups[targets.canStart ? 'operationAvailable' : 'operationBlocked'].push(plot);
  }
  if (continents) for (const [index, continent] of continents.entries()) {
    const plots = groups[`continent${index}`] = [];
    for (const location of continent.plotList) {
      yield;
      const plot = map.getIndexFromLocation(location);
      if (revealed(plot)) plots.push(plot);
    }
  }
  for (const key of Object.keys(groups)) groups[key] = [...new Set(groups[key])];
  return groups;
}

export function destinationPaths(groups, vertex, visible) {
  const steps = destinationPathSteps(groups, vertex, visible);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}
export function* destinationPathSteps(groups, vertex, visible) {
  const paths = {};
  let limited = false, count = 0, chars = 0;
  for (const [kind, plots] of Object.entries(groups)) {
    let path = '';
    for (const plot of plots) {
      yield;
      if (!visible(plot)) continue;
      if (count >= 1170) { limited = true; break; }
      let hex = '';
      for (let k = 0; k < 6; k++) { const [x, y] = vertex(plot, k); hex += `${k ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`; }
      hex += 'Z';
      if (chars + hex.length > 262144) { limited = true; break; }
      path += hex; count++; chars += hex.length;
    }
    paths[kind] = path;
  }
  return { paths, limited };
}
