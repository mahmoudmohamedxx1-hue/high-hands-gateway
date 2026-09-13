/**
 * Compact sanctions-pressure snapshot.
 *
 * The upstream deployment builds this from OFAC/SEMA pipelines (scripts/), which
 * are not part of the sandbox runtime. This snapshot mirrors that dataset's
 * shape with a stable, clearly-labelled cut so the Sanctions Pressure panel and
 * the map layer render realistic content offline.
 */

export interface SanctionsEntryData {
  id: string;
  name: string;
  entityType: "entity" | "individual" | "vessel" | "aircraft";
  countryCodes: string[];
  countryNames: string[];
  programs: string[];
  sourceLists: string[];
  effectiveAt: string;
  isNew: boolean;
  note: string;
}

export interface CountryPressureData {
  countryCode: string;
  countryName: string;
  entryCount: number;
  newEntryCount: number;
  vesselCount: number;
  aircraftCount: number;
}

export interface ProgramPressureData {
  program: string;
  entryCount: number;
  newEntryCount: number;
}

export const DATASET_DATE = "2026-09-01";

export const COUNTRIES: CountryPressureData[] = [
  { countryCode: "RU", countryName: "Russia", entryCount: 8412, newEntryCount: 96, vesselCount: 342, aircraftCount: 128 },
  { countryCode: "IR", countryName: "Iran", entryCount: 3781, newEntryCount: 54, vesselCount: 187, aircraftCount: 71 },
  { countryCode: "KP", countryName: "North Korea", entryCount: 1104, newEntryCount: 21, vesselCount: 63, aircraftCount: 12 },
  { countryCode: "CN", countryName: "China", entryCount: 689, newEntryCount: 38, vesselCount: 12, aircraftCount: 3 },
  { countryCode: "VE", countryName: "Venezuela", entryCount: 592, newEntryCount: 9, vesselCount: 41, aircraftCount: 6 },
  { countryCode: "BY", countryName: "Belarus", entryCount: 431, newEntryCount: 12, vesselCount: 5, aircraftCount: 2 },
  { countryCode: "SY", countryName: "Syria", entryCount: 388, newEntryCount: 4, vesselCount: 9, aircraftCount: 1 },
  { countryCode: "CU", countryName: "Cuba", entryCount: 122, newEntryCount: 2, vesselCount: 0, aircraftCount: 0 },
  { countryCode: "MM", countryName: "Myanmar", entryCount: 108, newEntryCount: 6, vesselCount: 2, aircraftCount: 0 },
  { countryCode: "SD", countryName: "Sudan", entryCount: 76, newEntryCount: 5, vesselCount: 0, aircraftCount: 0 },
  { countryCode: "AF", countryName: "Afghanistan", entryCount: 64, newEntryCount: 1, vesselCount: 0, aircraftCount: 0 },
  { countryCode: "LY", countryName: "Libya", entryCount: 41, newEntryCount: 0, vesselCount: 3, aircraftCount: 0 },
];

export const PROGRAMS: ProgramPressureData[] = [
  { program: "SDN List", entryCount: 7960, newEntryCount: 104 },
  { program: "Consolidated Non-SDN", entryCount: 4182, newEntryCount: 61 },
  { program: "Russia-Related (EO 14024)", entryCount: 4107, newEntryCount: 78 },
  { program: "Iran-Related (EO 13902)", entryCount: 2185, newEntryCount: 33 },
  { program: "SEMA / Price Cap", entryCount: 612, newEntryCount: 18 },
  { program: "Non-Proliferation (DPRK, INA)", entryCount: 894, newEntryCount: 14 },
  { program: "Counter-Terrorism", entryCount: 486, newEntryCount: 7 },
  { program: "Narcotics (Kingpin)", entryCount: 311, newEntryCount: 3 },
];

export const ENTRIES: SanctionsEntryData[] = [
  { id: "sdn-ru-bank-1", name: "Public Joint Stock Company Bank — Rossiya", entityType: "entity", countryCodes: ["RU"], countryNames: ["Russia"], programs: ["Russia-Related (EO 14024)"], sourceLists: ["SDN"], effectiveAt: "2026-08-14", isNew: false, note: "Correspondent-banking restrictions." },
  { id: "sdn-ru-tanker-12", name: "M/T NEVA SPIRIT", entityType: "vessel", countryCodes: ["RU"], countryNames: ["Russia"], programs: ["SEMA / Price Cap"], sourceLists: ["SDN"], effectiveAt: "2026-08-30", isNew: true, note: "Crude tanker listed for price-cap breach." },
  { id: "sdn-ru-tanker-13", name: "M/V BALTIC LEADER-7", entityType: "vessel", countryCodes: ["RU"], countryNames: ["Russia"], programs: ["SEMA / Price Cap"], sourceLists: ["SDN"], effectiveAt: "2026-08-27", isNew: true, note: "Shadow-fleet turnaround flagged via AIS gaps." },
  { id: "sdn-ru-ind-4", name: "Sergei V. Chemezov", entityType: "individual", countryCodes: ["RU"], countryNames: ["Russia"], programs: ["Russia-Related (EO 14024)"], sourceLists: ["SDN"], effectiveAt: "2026-08-19", isNew: false, note: "Defense-industrial conglomerate executive." },
  { id: "sdn-ru-entity-77", name: "Vostok Energy Systems JSC", entityType: "entity", countryCodes: ["RU"], countryNames: ["Russia"], programs: ["Russia-Related (EO 14024)"], sourceLists: ["SDN"], effectiveAt: "2026-08-22", isNew: true, note: "Turbine supplier for sanctioned Arctic LNG project." },
  { id: "sdn-ir-entity-31", name: "Pars Oil & Gas Company affiliate", entityType: "entity", countryCodes: ["IR"], countryNames: ["Iran"], programs: ["Iran-Related (EO 13902)"], sourceLists: ["SDN"], effectiveAt: "2026-07-30", isNew: false, note: "Gas-field development subsidiary." },
  { id: "sdn-ir-vessel-18", name: "MT GULF PEACH", entityType: "vessel", countryCodes: ["IR"], countryNames: ["Iran"], programs: ["Iran-Related (EO 13902)"], sourceLists: ["SDN"], effectiveAt: "2026-08-25", isNew: true, note: "Crude transfer linked to sanctioned trading desk." },
  { id: "sdn-ir-ind-9", name: "Reza Fallahian-Jelodar", entityType: "individual", countryCodes: ["IR"], countryNames: ["Iran"], programs: ["Iran-Related (EO 13902)", "Counter-Terrorism"], sourceLists: ["SDN"], effectiveAt: "2026-06-12", isNew: false, note: "Procurement network facilitator." },
  { id: "sdn-kp-entity-11", name: "Chonma Trading Division", entityType: "entity", countryCodes: ["KP"], countryNames: ["North Korea"], programs: ["Non-Proliferation (DPRK, INA)"], sourceLists: ["SDN"], effectiveAt: "2026-08-18", isNew: true, note: "Missile-component procurement front." },
  { id: "sdn-kp-vessel-6", name: "CHONG CHON GANG 2", entityType: "vessel", countryCodes: ["KP"], countryNames: ["North Korea"], programs: ["Non-Proliferation (DPRK, INA)"], sourceLists: ["SDN"], effectiveAt: "2026-08-08", isNew: false, note: "Repeated ship-to-ship transfer watch." },
  { id: "sdn-cn-entity-52", name: "Shenzhen Xinyun Tech Co.", entityType: "entity", countryCodes: ["CN"], countryNames: ["China"], programs: ["Non-Proliferation (DPRK, INA)"], sourceLists: ["SDN"], effectiveAt: "2026-08-29", isNew: true, note: "Exported controlled dual-use components." },
  { id: "sdn-ve-entity-14", name: "Petroleos de Venezuela S.A. (PDVSA) unit", entityType: "entity", countryCodes: ["VE"], countryNames: ["Venezuela"], programs: ["Counter-Terrorism"], sourceLists: ["SDN"], effectiveAt: "2026-07-19", isNew: false, note: "Oil marketing affiliate." },
  { id: "sdn-by-entity-8", name: "Belavia Technics OJSC", entityType: "entity", countryCodes: ["BY"], countryNames: ["Belarus"], programs: ["Russia-Related (EO 14024)"], sourceLists: ["Consolidated"], effectiveAt: "2026-08-05", isNew: true, note: "Aircraft maintenance for sanctioned carriers." },
  { id: "sdn-sy-entity-5", name: "Syrian Trade & Logistics Establishment", entityType: "entity", countryCodes: ["SY"], countryNames: ["Syria"], programs: ["Counter-Terrorism"], sourceLists: ["SDN"], effectiveAt: "2026-05-24", isNew: false, note: "Captagon-adjacent logistics network." },
  { id: "sdn-mm-entity-7", name: "Myanmar Precious Resources Co.", entityType: "entity", countryCodes: ["MM"], countryNames: ["Myanmar"], programs: ["Counter-Terrorism"], sourceLists: ["SDN"], effectiveAt: "2026-08-11", isNew: true, note: "Timber-and-jade revenue channel for military junta." },
  { id: "sdn-sd-entity-4", name: "Al-Fursan Procurement Bureau", entityType: "entity", countryCodes: ["SD"], countryNames: ["Sudan"], programs: ["Counter-Terrorism"], sourceLists: ["SDN"], effectiveAt: "2026-08-21", isNew: true, note: "Arms procurement in Darfur theater." },
  { id: "sdn-af-entity-3", name: "Hawala Network — Kandahar Hub", entityType: "entity", countryCodes: ["AF"], countryNames: ["Afghanistan"], programs: ["Counter-Terrorism"], sourceLists: ["SDN"], effectiveAt: "2026-04-30", isNew: false, note: "Unlicensed value-transfer network." },
  { id: "sdn-ly-vessel-2", name: "MV SIRTE ANCHORAGE", entityType: "vessel", countryCodes: ["LY"], countryNames: ["Libya"], programs: ["Narcotics (Kingpin)"], sourceLists: ["SDN"], effectiveAt: "2026-03-15", isNew: false, note: "Fuel-smuggling route surveillance." },
  { id: "sdn-ru-air-3", name: "An-124 RA-82074 (lease chain)", entityType: "aircraft", countryCodes: ["RU"], countryNames: ["Russia"], programs: ["Russia-Related (EO 14024)"], sourceLists: ["SDN"], effectiveAt: "2026-08-16", isNew: true, note: "Heavy-lift flights breaching export controls." },
  { id: "sdn-ir-air-1", name: "Mahan Air A310 fleet block", entityType: "aircraft", countryCodes: ["IR"], countryNames: ["Iran"], programs: ["Iran-Related (EO 13902)", "Counter-Terrorism"], sourceLists: ["SDN"], effectiveAt: "2026-02-20", isNew: false, note: "Fleet-wide designation." },
];

export function buildSanctionsPayload() {
  return {
    entries: ENTRIES,
    countries: COUNTRIES,
    programs: PROGRAMS,
    fetchedAt: new Date().toISOString(),
    datasetDate: DATASET_DATE,
    totalCount: COUNTRIES.reduce((sum, c) => sum + c.entryCount, 0),
    sdnCount: PROGRAMS.find((p) => p.program === "SDN List")?.entryCount ?? 0,
    consolidatedCount: PROGRAMS.find((p) => p.program === "Consolidated Non-SDN")?.entryCount ?? 0,
    semaCount: PROGRAMS.find((p) => p.program === "SEMA / Price Cap")?.entryCount ?? 0,
    semaError: null,
    newEntryCount: COUNTRIES.reduce((sum, c) => sum + c.newEntryCount, 0),
    vesselCount: COUNTRIES.reduce((sum, c) => sum + c.vesselCount, 0),
    aircraftCount: COUNTRIES.reduce((sum, c) => sum + c.aircraftCount, 0),
  };
}
