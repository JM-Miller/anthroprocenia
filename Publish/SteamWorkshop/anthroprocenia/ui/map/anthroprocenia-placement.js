export function getPlacementGroups(mode, handler, building, workers, cities) {
  if (mode === 'INTERFACEMODE_ACQUIRE_TILE') {
    if (!handler || !Array.isArray(handler.validPlots) || !Array.isArray(handler.validNeighborPlots)) {
      throw new Error('settlement expansion plot data is unavailable');
    }
    const city = cities.get(handler.cityID);
    return {
      cityID: handler.cityID,
      groups: [
        city && city.getPurchasedPlots ? city.getPurchasedPlots() : [],
        handler.validPlots,
        city && !city.isTown ? workers.workablePlotIndexes : [],
        handler.validNeighborPlots
      ],
      yieldPlots: [...new Set([...handler.validPlots, ...workers.workablePlotIndexes])],
      mode: 'growth'
    };
  }
  if (mode === 'INTERFACEMODE_PLACE_BUILDING') {
    return {
      cityID: building.cityID,
      groups: [[], building.urbanPlots, building.developedPlots, building.expandablePlots],
      yieldPlots: [...new Set([...building.urbanPlots, ...building.developedPlots, ...building.expandablePlots])],
      mode: 'building'
    };
  }
  return null;
}

export function placementYields(state, plot, building, workers, gameplayMap, gameInfo, playerID) {
  if (state.mode === 'building') {
    if (!building.selectedPlacementData || !building.getPlacementPlotData(plot)) return [];
    return building.getTotalYieldChanges(plot)
      .filter(change => Number.isFinite(change.yieldChange) && change.yieldChange !== 0)
      .map(change => ({ type: change.yieldType, amount: change.yieldChange, delta: true }));
  }
  const specialist = workers.workablePlots.find(info => info.PlotIndex === plot);
  if (specialist) {
    const yields = specialist.NextYields.map((value, i) => ({
      type: gameInfo.Yields[i]?.YieldType,
      amount: Math.round((value - specialist.CurrentYields[i]) * 10) / 10,
      delta: true
    }));
    specialist.NextMaintenance.forEach((value, i) => {
      const amount = Math.round((specialist.CurrentMaintenance[i] - value) * 10) / 10;
      const type = gameInfo.Yields[i]?.YieldType;
      const existing = yields.find(entry => entry.type === type);
      if (existing) existing.amount += amount;
      else yields.push({ type, amount, delta: true });
    });
    return yields.filter(value => value.type && Number.isFinite(value.amount) && value.amount !== 0);
  }

  const yields = state.cityID ? gameplayMap.getYieldsWithCity(plot, state.cityID) : gameplayMap.getYields(plot, playerID);
  return [...(yields || [])].map(([type, amount]) => ({
    type: gameInfo.Yields.lookup(type)?.YieldType, amount, delta: false
  })).filter(value => value.type && Number.isFinite(value.amount) && value.amount !== 0);
}

export function localCityAtPlot(index, gameplayMap, mapCities, districts, cities, cityCenterType, playerID) {
  if (index < 0) return null;
  const location = gameplayMap.getLocationFromIndex(index);
  const districtID = mapCities.getDistrict(location.x, location.y);
  const district = districtID && districts.get(districtID);
  if (!district || district.type !== cityCenterType || !district.cityId) return null;
  const city = cities.get(district.cityId);
  return city && city.owner === playerID ? district.cityId : null;
}

export function dispatchPlacementSelection(event, location, worldInput, selectionAllowed) {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (selectionAllowed) worldInput.selectPlot(location);
}

export function validCameraAspect(aspect) {
  return Number.isFinite(aspect) && aspect >= 0.3 && aspect <= 1.5;
}

export function placementYieldScale(hexWidth, hexHeight, zoom, aspect) {
  const scale = Math.min(1.25, hexWidth * zoom / 72, hexHeight * zoom * aspect / 20);
  return [scale / zoom, scale / (zoom * aspect)];
}

// On-screen font size (px) of a constructible label: proportional to the map while zoomed out, then shrinking as the
// player zooms in so labels stop swamping the tiles they describe, never below a legible floor.
export function siteLabelFontPx(zoom, mapFontSize) {
  const natural = mapFontSize * zoom, knee = 14;
  return natural <= knee ? natural : Math.max(9, knee * Math.sqrt(knee / natural));
}

// Shifts points by whole map widths so that consecutive points are never more than half a map apart (the map wraps).
export function unwrapPathPoints(points, period) {
  const out = [];
  let offset = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && period > 0) {
      const dx = points[i].x + offset - out[i - 1].x;
      if (Math.abs(dx) > period / 2) offset -= Math.sign(dx) * period;
    }
    out.push({ ...points[i], x: points[i].x + offset });
  }
  return out;
}

// Where turn numbers go on a movement path: the last tile of each turn and the destination, or every tile when asked.
export function pathTurnLabels(plots, turns, everyTile) {
  const labels = [];
  if (!Array.isArray(plots) || !Array.isArray(turns)) return labels;
  for (let i = 1; i < plots.length; i++) {
    if (!Number.isFinite(turns[i])) continue;
    if (everyTile || i === plots.length - 1 || turns[i] !== turns[i + 1]) labels.push({ i, turn: turns[i] });
  }
  return labels;
}
