import { isFunction, each, map } from 'lodash';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'beautifymarker';
import 'beautifymarker/leaflet-beautify-marker-icon.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet-fullscreen';
import 'leaflet-fullscreen/dist/leaflet.fullscreen.css';
import resizeObserver from '@/services/resizeObserver';

// This is a workaround for an issue with giving Leaflet load the icon on its own.
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIconRetina,
  shadowUrl: markerShadow,
});

delete L.Icon.Default.prototype._getIconUrl;

const iconAnchors = {
  marker: [14, 32],
  circle: [10, 10],
  rectangle: [11, 11],
  'circle-dot': [1, 2],
  'rectangle-dot': [1, 2],
  doughnut: [8, 8],
};

const popupAnchors = {
  rectangle: [0, -3],
  circle: [1, -3],
};

const createHeatpointMarker = (lat, lon, color) => L.circleMarker(
  [lat, lon],
  { fillColor: color, fillOpacity: 0.9, stroke: false },
);

const createDefaultMarker = (lat, lon) => L.marker([lat, lon]);

function createIconMarker(lat, lon, { iconShape, iconFont, foregroundColor, backgroundColor, borderColor }) {
  const icon = L.BeautifyIcon.icon({
    iconShape,
    icon: iconFont,
    iconSize: iconShape === 'rectangle' ? [22, 22] : false,
    iconAnchor: iconAnchors[iconShape],
    popupAnchor: popupAnchors[iconShape],
    prefix: 'fa',
    textColor: foregroundColor,
    backgroundColor,
    borderColor,
  });

  return L.marker([lat, lon], { icon });
}

function createMarkerClusterGroup(classify, color) {
  const layerOptions = {};

  if (classify) {
    layerOptions.iconCreateFunction = (cluster) => {
      const childCount = cluster.getChildCount();
      const style = `color: white; background-color: ${color};`;
      return L.divIcon({
        html: `<div style="${style}"><span>${childCount}</span></div>`,
        className: 'marker-cluster',
        iconSize: new L.Point(40, 40),
      });
    };
  }

  return L.markerClusterGroup(layerOptions);
}

function createMarkersLayer(options, { color, points }) {
  const { classify, clusterMarkers, customizeMarkers } = options;

  const result = clusterMarkers ? createMarkerClusterGroup(classify, color) : L.layerGroup();

  // create markers
  each(points, ({ lat, lon, row }) => {
    let marker;
    if (classify) {
      marker = createHeatpointMarker(lat, lon, color);
    } else {
      if (customizeMarkers) {
        marker = createIconMarker(lat, lon, options);
      } else {
        marker = createDefaultMarker(lat, lon);
      }
    }

    marker.bindPopup(`
      <ul style="list-style-type: none; padding-left: 0">
        <li><strong>${lat}, ${lon}</strong>
        ${map(row, (v, k) => `<li>${k}: ${v}</li>`).join('')}
      </ul>
  `);
    result.addLayer(marker);
  });

  return result;
}

export default function initMap(container) {
  const _map = L.map(container, {
    center: [0.0, 0.0],
    zoom: 1,
    scrollWheelZoom: false,
    fullscreenControl: true,
  });
  const _tileLayer = L.tileLayer('//{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(_map);
  const _markerLayers = L.featureGroup().addTo(_map);
  const _layersControls = L.control.layers().addTo(_map);

  let onBoundsChange = () => {};

  let boundsChangedFromMap = false;
  const onMapMoveEnd = () => {
    onBoundsChange(_map.getBounds());
  };
  _map.on('focus', () => {
    boundsChangedFromMap = true;
    _map.on('moveend', onMapMoveEnd);
  });
  _map.on('blur', () => {
    _map.off('moveend', onMapMoveEnd);
    boundsChangedFromMap = false;
  });

  function updateLayers(groups, options) {
    _tileLayer.setUrl(options.mapTileUrl);

    _markerLayers.eachLayer((layer) => {
      _markerLayers.removeLayer(layer);
      _layersControls.removeLayer(layer);
    });

    each(groups, (group) => {
      const layer = createMarkersLayer(options, group);
      _markerLayers.addLayer(layer);
      _layersControls.addOverlay(layer, group.name);
    });

    // hide layers control if it is empty
    if (groups.length > 0) {
      _layersControls.addTo(_map);
    } else {
      _layersControls.remove();
    }
  }

  function updateBounds(bounds) {
    if (!boundsChangedFromMap) {
      bounds = bounds ? L.latLngBounds(
        [bounds._southWest.lat, bounds._southWest.lng],
        [bounds._northEast.lat, bounds._northEast.lng],
      ) : _markerLayers.getBounds();
      if (bounds.isValid()) {
        _map.fitBounds(bounds, { animate: false, duration: 0 });
      }
    }
  }

  const unwatchResize = resizeObserver(container, () => { _map.invalidateSize(false); });

  return {
    get onBoundsChange() {
      return onBoundsChange;
    },
    set onBoundsChange(value) {
      onBoundsChange = isFunction(value) ? value : () => {};
    },
    updateLayers,
    updateBounds,
    destroy() {
      unwatchResize();
      _map.remove();
    },
  };
}