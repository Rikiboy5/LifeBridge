import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import bluePin from "../assets/pins/blue-pin.png";
import greenPin from "../assets/pins/green-pin.png";
import orangePin from "../assets/pins/orange-pin.png";
import purplePin from "../assets/pins/purple-pin.png";

interface Pin {
  id: number;
  name: string;
  lat: number;
  lng: number;
  description: string;
  category?: string;
}

interface MapProps {
  pins: Pin[];
}

const iconSize: [number, number] = [32, 48];

const icons: Record<string, L.Icon> = {
  "dobrovolnictvo": L.icon({ iconUrl: bluePin, iconSize }),
  "zahrada": L.icon({ iconUrl: greenPin, iconSize }),
  "technologie": L.icon({ iconUrl: orangePin, iconSize }),
  "vzdelavanie": L.icon({ iconUrl: purplePin, iconSize }),

  // fallback
  "default": L.icon({ iconUrl: bluePin, iconSize }),
};

export default function Map({ pins }: MapProps) {
  const [isDark, setIsDark] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const mapStyle = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  return (
    <div className="h-[500px] w-full rounded-2xl overflow-hidden shadow-md border border-gray-300 dark:border-gray-700 transition">
      <MapContainer
        center={[48.1486, 17.1077]}
        zoom={7}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          url={mapStyle}
          attribution="&copy; OpenStreetMap & Carto contributors"
        />

        {pins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            icon={icons[pin.category?.toLowerCase() ?? "default"]}
          >
            <Popup>
              <h3 className="font-semibold text-lg mb-2">{pin.name}</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-3">
                {pin.description}
              </p>
              <button
                onClick={() => navigate(`/activities/${pin.id}`)}
                className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition text-sm"
              >
                Zobraziť detail
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
