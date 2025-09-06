import { get, set, del } from 'idb-keyval'

const KEY = {
  items: 'cache.items',
  locations: 'cache.locations',
  boxesByLocation: (locId) => `cache.boxes.${locId}`,
  visit: (id) => `cache.visit.${id}`,
}

export async function cacheItems(list){ return set(KEY.items, list) }
export async function getItems(){ return (await get(KEY.items)) || [] }

export async function cacheLocations(list){ return set(KEY.locations, list) }
export async function getLocations(){ return (await get(KEY.locations)) || [] }

export async function cacheBoxes(locId, list){ return set(KEY.boxesByLocation(locId), list) }
export async function getBoxes(locId){ return (await get(KEY.boxesByLocation(locId))) || [] }

export async function cacheVisit(id, v){ return set(KEY.visit(id), v) }
export async function getVisit(id){ return (await get(KEY.visit(id))) || null }

// Simple “has data” check
export async function offlineReady() {
  const items = await getItems()
  const locs  = await getLocations()
  return items.length > 0 && locs.length > 0
}
