import type { Report } from './model'

const radians = (degrees: number) => degrees * Math.PI / 180

export function haversineMeters(a: {lat: number; lng: number}, b: {lat: number; lng: number}) {
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)))
}

function normalized(address: string) {
  return address.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()
}

export function nearby(a: Report['location'], b: Report['location']) {
  if (a.lat !== undefined && a.lng !== undefined && b.lat !== undefined && b.lng !== undefined) {
    return haversineMeters({lat: a.lat, lng: a.lng}, {lat: b.lat, lng: b.lng}) <= 100
  }
  const address = normalized(a.address)
  return !!address && address === normalized(b.address)
}
