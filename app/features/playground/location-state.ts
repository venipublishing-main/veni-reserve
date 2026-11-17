import type { Configuration } from "./session";
import { offlineLocalities } from "./localities";

/** Only a selected catalogue result may populate a zone; older explicit choices stay manual. */
export function selectLocality(c: Configuration, id: string, locked: boolean): Configuration {
  const place = offlineLocalities.resolve(id);
  if (!place) return c;
  const automatic = !locked && (!c.business.timezone || c.business.timezoneSource === "locality");
  return { ...c, location: { ...c.location, localityId: id }, business: automatic
    ? { ...c.business, timezone: place.timezone, timezoneSource: "locality" } : c.business };
}
