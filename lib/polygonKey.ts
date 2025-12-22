import type { Feature, Polygon, Position } from 'geojson';

function roundCoord(n: number, precision: number): string {
  // Avoid "-0.000000"
  const fixed = n.toFixed(precision);
  return fixed === '-0.' + '0'.repeat(precision) ? '0.' + '0'.repeat(precision) : fixed;
}

function coordToToken(p: Position, precision: number): string {
  return `${roundCoord(p[0], precision)} ${roundCoord(p[1], precision)}`;
}

function stripClosingPoint(ring: Position[], precision: number): Position[] {
  if (ring.length < 2) return ring;

  const first = coordToToken(ring[0], precision);
  const last = coordToToken(ring[ring.length - 1], precision);
  if (first === last) {
    return ring.slice(0, -1);
  }
  return ring;
}

function rotateToSmallest(tokens: string[]): string[] {
  if (tokens.length === 0) return tokens;
  let minIdx = 0;
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] < tokens[minIdx]) minIdx = i;
  }
  return tokens.slice(minIdx).concat(tokens.slice(0, minIdx));
}

function canonicalizeRingTokens(tokens: string[]): string[] {
  const forward = rotateToSmallest(tokens);
  const reversed = rotateToSmallest([...tokens].reverse());
  const f = forward.join('|');
  const r = reversed.join('|');
  return f <= r ? forward : reversed;
}

export function polygonToKey(polygon: Feature<Polygon>, precision: number = 6): string {
  const ring = polygon.geometry.coordinates?.[0] || [];
  return ringToKey(ring, precision);
}

export function ringToKey(ring: Position[], precision: number = 6): string {
  const openRing = stripClosingPoint(ring, precision);
  const tokens = openRing.map((p) => coordToToken(p, precision));
  const canonical = canonicalizeRingTokens(tokens);
  return canonical.join('|');
}


