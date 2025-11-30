export interface FlightEndpointInfo {
  code?: string | null;
  alternateCode?: string | null;
  airportName?: string | null;
  city?: string | null;
  terminal?: string | null;
  gate?: string | null;
  timezone?: string | null;
}

export interface FlightStatusPayload {
  ident: string;
  operator?: string | null;
  flightNumber?: string | null;
  status: string;
  statusText?: string | null;
  origin: FlightEndpointInfo;
  destination: FlightEndpointInfo;
  scheduledDeparture?: string | null;
  estimatedDeparture?: string | null;
  scheduledArrival?: string | null;
  estimatedArrival?: string | null;
  actualArrival?: string | null;
  gateDeparture?: string | null;
  gateArrival?: string | null;
  terminalDeparture?: string | null;
  terminalArrival?: string | null;
  baggage?: string | null;
  durationMinutes?: number | null;
  arrivalDelayMinutes?: number | null;
  trackingUrl?: string | null;
  provider: string;
  fetchedAt: string;
}
