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

export function unitDestinationGroups({ unit, definition, lens, targets, continents, player, map, districts, constructibles, definitions, cities, success }) {
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
    groups.religion = [...unit.getActivationOperationPlots('UNITOPERATION_SPREAD_RELIGION', false)].filter(revealed);
  } else if (definition.MakeTradeRoute) {
    requireMethod(unit, 'getActivationPlots');
    requireMethod(player.Trade, 'projectPossibleTradeRoutes');
    groups.roads = [...unit.getActivationPlots('UNITCOMMAND_CONNECT_WITH_ROAD', false)].filter(revealed);
    for (const route of player.Trade.projectPossibleTradeRoutes()) {
      if (!route.status || !route.status.length) throw new Error('A projected trade-route status is unavailable.');
      const city = cities.get(route.targetCityId);
      if (!city) throw new Error('A projected trade-route destination city is unavailable.');
      requireMethod(city, 'getPurchasedPlots');
      const plots = city.getPurchasedPlots();
      groups[route.status[0] === success ? 'trade' : 'tradeBlocked'].push(...(plots.length ? plots : [map.getIndexFromLocation(city.location)]).filter(revealed));
    }
  } else if (definition.FoundCity || lens === 'fxs-discovery-lens') {
    const scout = !definition.FoundCity;
    if (!scout) { requireMethod(player.Diplomacy, 'isValidLandClaimLocation'); requireMethod(map, 'isFreshWater'); requireMethod(map, 'isWater'); }
    for (let plot = 0; plot < map.getGridWidth() * map.getGridHeight(); plot++) {
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
  if (targets) groups[targets.canStart ? 'operationAvailable' : 'operationBlocked'] = targets.plots.filter(revealed);
  if (continents) for (const [index, continent] of continents.entries()) {
    groups[`continent${index}`] = continent.plotList.map(location => map.getIndexFromLocation(location)).filter(revealed);
  }
  for (const key of Object.keys(groups)) groups[key] = [...new Set(groups[key])];
  return groups;
}

export function destinationPaths(groups, vertex, visible) {
  const paths = {};
  let limited = false, count = 0, chars = 0;
  for (const [kind, plots] of Object.entries(groups)) {
    let path = '';
    for (const plot of plots) {
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
