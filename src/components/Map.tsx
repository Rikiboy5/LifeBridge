import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIconPng from "leaflet/dist/images/marker-icon.png";
import markerShadowPng from "leaflet/dist/images/marker-shadow.png";

// 🔹 Nastavenie defaultných ikon (inak by sa nezobrazovali)
const DefaultIcon = L.icon({
  iconUrl: markerIconPng,
  shadowUrl: markerShadowPng,
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// 🔹 Typ pre piny
interface Pin {
  id: number;
  name: string;
  lat: number;
  lng: number;
  description: string;
}

interface MapProps {
  pins: Pin[];
}

export default function Map({ pins }: MapProps) {
  const [isDark, setIsDark] = useState(false);

  // Sleduje zmeny Tailwind dark/light módu
  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // 🗺️ Dynamické štýly mapy podľa témy
  const mapStyle = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  const attribution =
    '&copy; <a href="https://carto.com/">Carto</a>, &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors';

  return (
    <div className="h-[500px] w-full rounded-2xl overflow-hidden shadow-md border border-gray-300 dark:border-gray-700 transition">
      <MapContainer
        center={[48.1486, 17.1077]} // Bratislava
        zoom={7}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer attribution={attribution} url={mapStyle} />
        {pins.map((pin) => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]}>
            <Popup>
              <h3 className="font-semibold text-lg mb-1">{pin.name}</h3>
              <p className="text-gray-600 dark:text-gray-300">{pin.description}</p>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
