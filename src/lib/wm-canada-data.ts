/**
 * Canada public-safety alert snapshot.
 *
 * weather.gc.ca is not reachable from this sandbox's egress, so the live
 * Environment Canada RSS poll cannot run. This snapshot mirrors the
 * canadaAlerts bootstrap payload shape so the Canada Alerts map layer and
 * panel render realistic content.
 */

export interface CanadaAlertData {
  id: string;
  province: string;
  event: string;
  severity: "Extreme" | "Severe" | "Moderate" | "Minor";
  headline: string;
  description: string;
  areaDesc: string;
  onset: string;
  expires: string | null;
  lat: number;
  lon: number;
  source: string;
}

const now = Date.now();
const hours = (h: number) => new Date(now + h * 3600_000).toISOString();

export const CANADA_ALERTS: CanadaAlertData[] = [
  {
    id: "ec-on-wrn-1", province: "Ontario", event: "Blowing Snow Warning", severity: "Severe",
    headline: "WARNING: BLOWING SNOW IN EFFECT",
    description: "Blowing snow reducing visibility to near zero at times. Travel is not recommended along exposed sections of Highway 17.",
    areaDesc: "Sault Ste. Marie - Algoma", onset: hours(-4), expires: hours(8), lat: 46.5, lon: -84.3, source: "ec-alerts",
  },
  {
    id: "ec-on-wrn-2", province: "Ontario", event: "Winter Weather Travel Advisory", severity: "Moderate",
    headline: "STATEMENT: SNOWFALL ADVISORY IN EFFECT",
    description: "Local snowfall amounts of 10 to 15 cm expected this evening into overnight. Motorists should adjust travel plans accordingly.",
    areaDesc: "Toronto - Southern Durham", onset: hours(-2), expires: hours(14), lat: 43.7, lon: -79.4, source: "ec-alerts",
  },
  {
    id: "ec-qc-wrn-1", province: "Quebec", event: "Wind Warning", severity: "Severe",
    headline: "WARNING: STRONG WINDS IN EFFECT",
    description: "Southerly winds gusting to 90 km/h expected. Loose objects may become dangerous projectiles; power outages possible.",
    areaDesc: "Montréal island", onset: hours(-1), expires: hours(11), lat: 45.5, lon: -73.6, source: "ec-alerts",
  },
  {
    id: "ec-bc-wrn-1", province: "British Columbia", event: "Rainfall Warning", severity: "Severe",
    headline: "WARNING: RAINFALL IN EFFECT",
    description: "A long-duration rainfall event with 80 to 120 mm expected over the North Shore mountains. Localized flooding in low-lying areas.",
    areaDesc: "Metro Vancouver - North Shore", onset: hours(-6), expires: hours(16), lat: 49.3, lon: -123.1, source: "ec-alerts",
  },
  {
    id: "ec-bc-wrn-2", province: "British Columbia", event: "Wind Advisory", severity: "Moderate",
    headline: "STATEMENT: WIND ADVISORY IN EFFECT",
    description: "Westerly winds 50 gusting 80 km/h over exposed coastal sections this afternoon.",
    areaDesc: "West Vancouver Island", onset: hours(-3), expires: hours(9), lat: 49.6, lon: -126.6, source: "ec-alerts",
  },
  {
    id: "ec-ab-wrn-1", province: "Alberta", event: "Snowfall Warning", severity: "Severe",
    headline: "WARNING: HEAVY SNOWFALL IN EFFECT",
    description: "10 to 20 cm of snow with locally higher amounts in the foothills. Poor visibility in heavy snow. Consider postponing non-essential travel.",
    areaDesc: "Calgary - Foothills", onset: hours(-5), expires: hours(12), lat: 51.0, lon: -114.3, source: "ec-alerts",
  },
  {
    id: "ec-ab-aea-1", province: "Alberta", event: "Wildfire Evacuation Alert", severity: "Extreme",
    headline: "ALERT: WILDFIRE EVACUATION ALERT",
    description: "Wildfire MWF-047 is 8 km from the community. Residents should be prepared to evacuate on short notice. Follow municipal channels.",
    areaDesc: "Slave Lake region", onset: hours(-1), expires: null, lat: 55.3, lon: -114.8, source: "alberta-aea",
  },
  {
    id: "ec-sk-wrn-1", province: "Saskatchewan", event: "Extreme Cold Warning", severity: "Severe",
    headline: "WARNING: EXTREME COLD IN EFFECT",
    description: "Wind chill values of -45 expected overnight. Frostbite can occur within minutes on exposed skin.",
    areaDesc: "Northern Saskatchewan", onset: hours(-8), expires: hours(10), lat: 54.5, lon: -105.0, source: "ec-alerts",
  },
  {
    id: "ec-mb-wrn-1", province: "Manitoba", event: "Blizzard Warning", severity: "Severe",
    headline: "WARNING: BLIZZARD IN EFFECT",
    description: "Snow and strong winds producing blizzard conditions. Visibility frequently less than 400 metres. Highway closures likely.",
    areaDesc: "Interlake region", onset: hours(-7), expires: hours(7), lat: 51.5, lon: -97.5, source: "ec-alerts",
  },
  {
    id: "ec-ns-wrn-1", province: "Nova Scotia", event: "Special Weather Statement", severity: "Minor",
    headline: "STATEMENT: HIGH WATER LEVELS",
    description: "High astronomical tides combined with onshore winds may cause minor coastal flooding along the Fundy shoreline.",
    areaDesc: "Bay of Fundy coast", onset: hours(-2), expires: hours(18), lat: 45.0, lon: -64.5, source: "ec-alerts",
  },
];
