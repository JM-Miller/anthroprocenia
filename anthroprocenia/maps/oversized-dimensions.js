import * as VoronoiTypes from '/base-standard/scripts/voronoi-types.js';

const { MapDims, SquareMapDims } = VoronoiTypes;

export function registerMapDimensions(params) {
  const { mapSize, width, height } = params;
  const needsRegular = !MapDims[mapSize], needsSquare = !!SquareMapDims && !SquareMapDims[mapSize];
  if (!needsRegular && !needsSquare) return;
  if (mapSize == null || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width <= 0 || height <= 0 || !Number.isSafeInteger(width * height)) {
    const message = `[ANTHROPROCENIA] Invalid map initialization: size=${mapSize}, dimensions=${width}x${height}`;
    console.error(message);
    throw new Error(message);
  }
  // The native request handler runs next and expects an entry for the engine's map-size ID.
  if (needsRegular) MapDims[mapSize] = { x: width, y: height };
  if (needsSquare) SquareMapDims[mapSize] = { x: width, y: height };
  console.log(`[ANTHROPROCENIA] Registered oversized map dimensions: size=${mapSize}, ${width}x${height}`);
}

engine.on('RequestMapInitData', registerMapDimensions);
console.log('[ANTHROPROCENIA] Oversized map compatibility loaded; awaiting RequestMapInitData.');
