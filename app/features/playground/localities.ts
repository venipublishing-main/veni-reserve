/** Small offline catalogue, GeoNames CC BY 4.0, checked 2026-11-10.
 * No arbitrary address parsing, geolocation or network calls. */
export type SelectedLocality = { id: string; city: string; country: string; timezone: string; source: string };
export interface LocalityProvider {
  search(query: string): readonly SelectedLocality[];
  resolve(id: string): SelectedLocality | undefined;
}
export const LOCALITIES: readonly SelectedLocality[] = [
  { id: "964137", city: "Pretoria", country: "South Africa", timezone: "Africa/Johannesburg", source: "https://www.geonames.org/964137/pretoria.html" },
  { id: "993800", city: "Johannesburg", country: "South Africa", timezone: "Africa/Johannesburg", source: "https://www.geonames.org/993800/johannesburg.html" },
  { id: "3369157", city: "Cape Town", country: "South Africa", timezone: "Africa/Johannesburg", source: "https://www.geonames.org/3369157/cape-town.html" },
  { id: "1007311", city: "Durban", country: "South Africa", timezone: "Africa/Johannesburg", source: "https://www.geonames.org/1007311/durban.html" },
];
const normalize = (value: string) => value.trim().toLowerCase().replaceAll(",", "").replace(/\s+/g, " ");
export const offlineLocalities: LocalityProvider = {
  search: query => LOCALITIES.filter(p => normalize(`${p.city} ${p.country} ZA`).includes(normalize(query))),
  resolve: id => LOCALITIES.find(p => p.id === id),
};
export function timezoneRecommendation(provider: LocalityProvider, selectedId: string) {
  return provider.resolve(selectedId)?.timezone ?? null;
}
