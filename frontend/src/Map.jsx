import React, { useRef, useEffect, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

function useAutoRefreshLayer(layerRef, intervalMs = 120000) {
  useEffect(() => {
    if (!layerRef.current) return;
    let mounted = true;
    const tick = () => {
      if (!mounted || !layerRef.current) return;
      const base = layerRef.current.options._baseUrl || "/api/mrms/export";
      const sep = base.includes("?") ? "&" : "?";
      const url = `${base}${sep}t=${Date.now()}`;
      try {
        layerRef.current.setUrl(url);
      } catch (e) {}
    };
    const id = setInterval(tick, intervalMs);
    tick();
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [layerRef, intervalMs]);
}

export default function MapView() {
  const layerRef = useRef(null);
  const [zoom] = useState(5);
  const center = [39.0, -98.5];
  const [info, setInfo] = useState("");

  function tileToBBox(x, y, z) {
    const n = Math.pow(2, z);
    const lon_deg_min = (x / n) * 360.0 - 180.0;
    const lon_deg_max = ((x + 1) / n) * 360.0 - 180.0;
    const lat_rad_min = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
    const lat_rad_max = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
    const lat_deg_min = lat_rad_min * (180 / Math.PI);
    const lat_deg_max = lat_rad_max * (180 / Math.PI);
    return `${lon_deg_min},${lat_deg_min},${lon_deg_max},${lat_deg_max}`;
  }

  function MRMSLayer() {
    const map = useMap();

    useEffect(() => {
      const grid = new L.GridLayer({
        pane: "overlayPane",
        opacity: 0.85,
        tileSize: 256,
      });

      grid.createTile = function (coords, done) {
        const tile = document.createElement("img");
        tile.setAttribute("role", "presentation");
        tile.style.width = "256px";
        tile.style.height = "256px";
        tile.style.filter = "contrast(1.6) brightness(1.1)";
        tile.className = "radar-tile";

        const bbox = tileToBBox(coords.x, coords.y, coords.z);
        const size = `${this.options.tileSize},${this.options.tileSize}`;
        const timestamp = Date.now();
        tile.src = `/api/mrms/export?bbox=${bbox}&size=${size}&t=${timestamp}`;
        tile.dataset.timestamp = new Date(timestamp).toISOString();

        tile.onload = () => done(null, tile);
        tile.onerror = () => done(null, tile);

        return tile;
      };

      grid.options._baseUrl = "/api/mrms/export";
      grid.addTo(map);
      layerRef.current = grid;
    }, [map]);

    useEffect(() => {
      if (!map) return;

      const handleClick = (e) => {
        const { lat, lng } = e.latlng;

        const overlayPane = map.getPane("overlayPane");
        let timestamp = null;
        if (overlayPane) {
          const imgs = overlayPane.getElementsByTagName("img");
          if (imgs.length > 0) timestamp = imgs[0].dataset.timestamp || null;
        }

        setInfo(
          `📍 Lat: ${lat.toFixed(4)} | Lng: ${lng.toFixed(4)} | Zoom: ${map.getZoom()}` +
            (timestamp ? `\n🕒 Radar Timestamp: ${timestamp}` : "")
        );
      };

      map.on("click", handleClick);
      return () => map.off("click", handleClick);
    }, [map]);

    useAutoRefreshLayer(layerRef, 120000);

    return null;
  }

  return (
    <div className="map-wrapper">
      <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }} zoomControl={false}>
        <TileLayer
          attribution="&copy; OpenStreetMap &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MRMSLayer />
      </MapContainer>

      {info && <div className="info-box">{info}</div>}

      {/* Radar legend */}
      <div className="radar-legend">
        <h4>Radar Reflectivity (dBZ)</h4>
        <div className="legend-bar">
  <div style={{ background: "#00ffff" }} title="0–10 dBZ: Very light / negligible precipitation">0–10</div>
  <div style={{ background: "#0099ff" }} title="10–20 dBZ: Light rain">10–20</div>
  <div style={{ background: "#00ff00" }} title="20–30 dBZ: Moderate rain">20–30</div>
  <div style={{ background: "#ffff00" }} title="30–40 dBZ: Moderate to heavy rain">30–40</div>
  <div style={{ background: "#ff9900" }} title="40–50 dBZ: Heavy rain">40–50</div>
  <div style={{ background: "#ff0000" }} title="50–60 dBZ: Very heavy / intense rain">50–60</div>
  <div style={{ background: "#9900ff" }} title="60+ dBZ: Severe / extreme intensity">60+</div>
</div>

      </div>
    </div>
  );
}
