import type { FlightStatusPayload } from '../shared/flightStatus';

export type FlightAwareStatus = FlightStatusPayload;

const defaultProjectId =
  (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || "calender-5e145";
const defaultEndpoint = `https://us-central1-${defaultProjectId}.cloudfunctions.net/flightAwareStatus`;

const endpoint =
  (import.meta.env.VITE_FLIGHT_STATUS_ENDPOINT as string | undefined)?.trim() || defaultEndpoint;

function buildRequestUrl(flightNo: string, eventDate: Date): string {
  const base = endpoint.startsWith("http")
    ? new URL(endpoint)
    : new URL(endpoint, typeof window !== "undefined" ? window.location.origin : "http://localhost");

  base.searchParams.set("flight", flightNo);
  base.searchParams.set("date", eventDate.toISOString());
  return base.toString();
}

export async function fetchFlightAwareStatus(
  flightNo: string,
  eventDate: Date,
): Promise<FlightAwareStatus | null> {
  if (!flightNo) return null;

  const url = buildRequestUrl(flightNo, eventDate);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    let detail: string | null = null;
    try {
      const parsed = text ? JSON.parse(text) : null;
      detail = parsed?.error || parsed?.detail || parsed?.message || null;
    } catch {
      // Ignore JSON parse errors and fall back to raw text.
    }
    throw new Error(detail || text || `HTTP ${response.status}`);
  }

  const json = await response.json();
  return (json?.flight as FlightAwareStatus) || null;
}
