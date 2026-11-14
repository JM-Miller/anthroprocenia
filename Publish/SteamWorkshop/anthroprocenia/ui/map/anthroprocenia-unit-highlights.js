export function unitDestinationGroups({ unit, type, player, map, districts, constructibles, definitions, cities, success }) {
  const groups = { discoveries: [], religion: [], trade: [], roads: [], settlements: [], freshwater: [] };
  const requireMethod = (object, method) => {
    if (!object || typeof object[method] !== 'function') throw new Error(`Unit destination highlights require ${method}.`);
  };
  const revealed = plot => {
    const location = map.getLocationFromIndex(plot);
    return map.getRevealedState(unit.owner, location.x, location.y) > 0;
  };
  if (/MISSIONARY/.test(type)) {
    requireMethod(unit, 'getActivationOperationPlots');
    groups.religion = [...unit.getActivationOperationPlots('UNITOPERATION_SPREAD_RELIGION', false)].filter(revealed);
  } else if (/MERCHANT/.test(type)) {
    requireMethod(unit, 'getActivationPlots');
    requireMethod(player.Trade, 'projectPossibleTradeRoutes');
    groups.roads = [...unit.getActivationPlots('UNITCOMMAND_CONNECT_WITH_ROAD', false)].filter(revealed);
    for (const route of player.Trade.projectPossibleTradeRoutes()) {
      if (!route.status || route.status[0] !== success) continue;
      const city = cities.get(route.targetCityId);
      if (!city) throw new Error('A projected trade-route destination city is unavailable.');
      const plot = map.getIndexFromLocation(city.location);
      if (revealed(plot)) groups.trade.push(plot);
    }
  } else if (/SCOUT|SETTLER/.test(type)) {
    const scout = /SCOUT/.test(type);
    if (!scout) { requireMethod(player.Diplomacy, 'isValidLandClaimLocation'); requireMethod(map, 'isFreshWater'); }
    for (let plot = 0; plot < map.getGridWidth() * map.getGridHeight(); plot++) {
      if (!revealed(plot)) continue;
      const location = map.getLocationFromIndex(plot);
      if (!scout) {
        if (player.Diplomacy.isValidLandClaimLocation(location, true)) groups[map.isFreshWater(location.x, location.y) ? 'freshwater' : 'settlements'].push(plot);
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
  for (const key of Object.keys(groups)) groups[key] = [...new Set(groups[key])];
  return groups;
}

export function destinationPaths(groups, vertex, visible) {
  const paths = {};
  let limited = false;
  for (const [kind, plots] of Object.entries(groups)) {
    let path = '', count = 0;
    for (const plot of plots) {
      if (!visible(plot)) continue;
      if (count >= 1170) { limited = true; break; }
      let hex = '';
      for (let k = 0; k < 6; k++) { const [x, y] = vertex(plot, k); hex += `${k ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`; }
      hex += 'Z';
      if (path.length + hex.length > 262144) { limited = true; break; }
      path += hex; count++;
    }
    paths[kind] = path;
  }
  return { paths, limited };
}
