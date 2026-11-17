import { noStore } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Open-Meteo forecast — no API key. Falls back to a labeled sample. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat") || "40.76");
  const lon = Number(url.searchParams.get("lon") || "-111.89");
  const day = url.searchParams.get("day"); // YYYY-MM-DD optional

  try {
    const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
    endpoint.searchParams.set("latitude", String(lat));
    endpoint.searchParams.set("longitude", String(lon));
    endpoint.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    endpoint.searchParams.set("timezone", "auto");
    endpoint.searchParams.set("forecast_days", "7");
    const res = await fetch(endpoint.toString(), { next: { revalidate: 1800 } });
    if (!res.ok) throw new Error(`meteo ${res.status}`);
    const data = (await res.json()) as {
      daily: {
        time: string[];
        weathercode: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
      };
    };
    let index = 0;
    if (day) {
      const found = data.daily.time.indexOf(day);
      if (found >= 0) index = found;
    }
    return Response.json(
      {
        source: "open-meteo",
        day: data.daily.time[index],
        code: data.daily.weathercode[index],
        high: data.daily.temperature_2m_max[index],
        low: data.daily.temperature_2m_min[index],
        precip: data.daily.precipitation_probability_max[index],
        summary: weatherLabel(data.daily.weathercode[index]),
      },
      { headers: noStore },
    );
  } catch {
    return Response.json(
      {
        source: "sample",
        day: day || new Date().toISOString().slice(0, 10),
        code: 1,
        high: 72,
        low: 48,
        precip: 10,
        summary: "Mostly clear (sample)",
      },
      { headers: noStore },
    );
  }
}

function weatherLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 67) return "Rainy";
  if (code <= 77) return "Snowy";
  if (code <= 82) return "Showers";
  if (code <= 99) return "Stormy";
  return "Mixed";
}
