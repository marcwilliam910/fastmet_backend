import { METRO_MANILA_CITIES } from "./locationHelpers";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface AddressComponent {
  longText: string;
  shortText: string;
  types?: string[];
}

interface PlacesApiResponse {
  addressComponents?: AddressComponent[];
}

export const getCityFromPlaceId = async (
  placeId: string,
): Promise<string | null> => {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("❌ GOOGLE_MAPS_API_KEY not configured");
    return null;
  }

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=addressComponents&key=${GOOGLE_MAPS_API_KEY}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error(`Google Places API error: ${response.status}`);
      return null;
    }

    const data: PlacesApiResponse = await response.json();

    // Try to find locality (city)
    let city = data.addressComponents?.find((c) =>
      c.types?.includes("locality"),
    )?.longText;

    // Fallback to administrative_area_level_2 if locality not found
    if (!city) {
      city = data.addressComponents?.find((c) =>
        c.types?.includes("administrative_area_level_2"),
      )?.longText;
    }

    // Validate it's a Metro Manila city
    if (city && METRO_MANILA_CITIES.includes(city)) {
      console.log(`✅ Google Places returned city: ${city}`);
      return city;
    }

    console.warn(`⚠️ City not in Metro Manila or not found: ${city}`);
    return null;
  } catch (error) {
    console.error("Error fetching city from Google Places:", error);
    return null;
  }
};
