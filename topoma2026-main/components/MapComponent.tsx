
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import { fromLonLat, toLonLat } from 'ol/proj';
import Draw, { createBox } from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Select from 'ol/interaction/Select';
import Snap from 'ol/interaction/Snap';
import { Style, Stroke, Fill, Circle as CircleStyle, Text, Icon } from 'ol/style';
import { ScaleLine, Zoom } from 'ol/control';
import Overlay from 'ol/Overlay';
import { getArea, getLength } from 'ol/sphere';
import KML from 'ol/format/KML';
import GeoJSON from 'ol/format/GeoJSON';
import Polygon from 'ol/geom/Polygon';
import MultiPolygon from 'ol/geom/MultiPolygon';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import MultiPoint from 'ol/geom/MultiPoint';
import Feature from 'ol/Feature';
import { convertToWGS84, calculateScale, getResolutionFromScale, projectFromZone, projectToZone, formatArea, fetchElevation, createPointDXF, createPointText, createPointKML } from '../services/geoService';
import { unByKey } from 'ol/Observable';

declare const shp: any;
declare const JSZip: any;

interface SelectionData {
    lat: string;
    lng: string;
    scale: string;
    bounds: number[];
    area?: string;      
    perimeter?: string; 
    projection?: string;
    featureId?: string;
}

interface ManualFeatureInfo {
    id: string;
    label: string;
    type: 'Polygon' | 'Rectangle' | 'Line' | 'Point';
}

interface MapComponentProps {
  onSelectionComplete: (data: SelectionData) => void;
  onMouseMove?: (x: string, y: string) => void;
  onManualFeaturesChange?: (features: ManualFeatureInfo[]) => void;
  selectedZone: string;
  mapType: 'satellite' | 'hybrid';
}

export interface MapComponentRef {
  getMapCanvas: (targetScale?: number, layerId?: string) => Promise<{ canvas: HTMLCanvasElement, extent: number[] } | null>;
  loadKML: (file: File, layerId: string) => void;
  loadShapefile: (file: File, layerId: string) => void;
  loadDXF: (file: File, zoneCode: string, layerId: string) => void;
  loadGeoJSON: (file: File, layerId: string) => void;
  loadExcelPoints: (layerId: string, points: any[]) => void;
  addManualPoint: (x: number, y: number, label: string) => void;
  setDrawTool: (type: 'Rectangle' | 'Polygon' | 'Point' | 'Line' | 'Edit' | 'Delete' | null) => void;
  setMeasureTool: (type: 'MeasureLength' | 'MeasureArea', unit: string) => void;
  updateMeasureUnit: (unit: string) => void;
  clearAll: () => void;
  undo: () => void;
  deleteSelectedFeature: () => void;
  setMapScale: (scale: number, centerOnSelection?: boolean) => void;
  locateUser: () => void;
  selectLayer: (layerId: string) => void;
  flyToLocation: (lon: number, lat: number, zoom?: number) => void;
  getLayerFeatures: (layerId: string) => any[];
  highlightFeature: (id: string) => void;
  getLayerAvailableFields: (layerId: string) => string[];
  setLayerLabelField: (layerId: string, fieldName: string) => void;
}

type PopupContent = 
  | { type: 'AREA', m2: string, ha: string }
  | { type: 'POINT', label: string, x: number, y: number, z: number | '...', lat: number, lon: number, zone: string, zoneLabel: string }
  | null;

const blueMarkerSvg = `<svg xmlns="http://www.w3.org/2000/svg" height="30" viewBox="0 0 24 24" width="30"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#2563eb" stroke="#ffffff" stroke-width="1"/></svg>`;

const MapComponent = forwardRef<MapComponentRef, MapComponentProps>(({ onSelectionComplete, onMouseMove, onManualFeaturesChange, selectedZone, mapType }, ref) => {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const sourceRef = useRef<VectorSource>(new VectorSource()); 
  const kmlSourceRef = useRef<VectorSource>(new VectorSource()); 
  const pointsSourceRef = useRef<VectorSource>(new VectorSource()); 
  const measureSourceRef = useRef<VectorSource>(new VectorSource()); 
  const baseLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const drawInteractionRef = useRef<Draw | null>(null);
  const modifyInteractionRef = useRef<Modify | null>(null);
  const selectInteractionRef = useRef<Select | null>(null);
  const snapInteractionRef = useRef<Snap | null>(null);
  const isDeleteModeRef = useRef<boolean>(false);
  const featureCounters = useRef({ Polygon: 1, Line: 1, Point: 1, Rectangle: 1 });
  const popupRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const [popupContent, setPopupContent] = useState<PopupContent>(null);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const selectedZoneRef = useRef(selectedZone); 
  const sketchRef = useRef<any>(null);
  const helpTooltipElementRef = useRef<HTMLElement | null>(null);
  const helpTooltipRef = useRef<Overlay | null>(null);
  const measureTooltipElementRef = useRef<HTMLElement | null>(null);
  const measureTooltipRef = useRef<Overlay | null>(null);
  const pointerMoveListenerRef = useRef<any>(null);
  const currentMeasureUnitRef = useRef<string>('m');
  const activeMeasurementsRef = useRef<Array<{ feature: Feature, overlay: Overlay, type: 'Length' | 'Area' }>>([]);
  const layerLabelFieldsRef = useRef<Record<string, string>>({});

  const getZoneLabel = (code: string) => {
      const zones: Record<string, string> = {
          'EPSG:26191': 'ZONE 1',
          'EPSG:26192': 'ZONE 2',
          'EPSG:26194': 'ZONE 3',
          'EPSG:26195': 'ZONE 4',
          'EPSG:4326': 'WGS 84'
      };
      return zones[code] || code;
  };

  const manualStyleFunction = (feature: any) => {
    const geometry = feature.getGeometry();
    const type = geometry.getType();
    const label = feature.get('label') || '';
    const textStyle = new Text({ text: label, font: 'bold 12px Roboto, sans-serif', fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#166534', width: 3 }), overflow: true, offsetY: type === 'Point' ? -25 : -10, placement: type === 'LineString' ? 'line' : 'point' });
    if (type === 'Point') {
        textStyle.getStroke().setColor('#000000');
        return new Style({ image: new Icon({ src: 'data:image/svg+xml;utf8,' + encodeURIComponent(blueMarkerSvg), anchor: [0.5, 1], scale: 1 }), text: textStyle });
    }
    if (type === 'Polygon' || type === 'MultiPolygon' || type === 'Circle') {
        const styles = [ new Style({ stroke: new Stroke({ color: '#22c55e', width: 2 }), fill: new Fill({ color: 'rgba(255, 255, 255, 0)' }), text: textStyle }) ];
        if (type === 'Polygon') { styles.push(new Style({ image: new CircleStyle({ radius: 3, fill: new Fill({ color: '#22c55e' }), stroke: new Stroke({ color: '#fff', width: 1 }) }), geometry: (f) => { const g = f.getGeometry() as Polygon; return new MultiPoint(g.getCoordinates()[0]); } })); }
        return styles;
    }
    return new Style({ stroke: new Stroke({ color: '#22c55e', width: 2 }), text: textStyle });
  };

  const kmlStyleFunction = (feature: any) => {
      const layerId = feature.get('layerId');
      const labelField = layerLabelFieldsRef.current[layerId];
      let labelText = '';
      if (labelField) {
          const val = feature.get(labelField);
          if (val !== undefined && val !== null) labelText = String(val);
      } else if (feature.get('label')) {
          labelText = feature.get('label');
      } else if (feature.get('name')) {
          labelText = feature.get('name');
      }

      // Professional Black Label with White Halo
      const textStyle = new Text({
          text: labelText,
          font: 'bold 12px Roboto, sans-serif',
          fill: new Fill({ color: '#000000' }), // Professional Black
          stroke: new Stroke({ color: '#ffffff', width: 4 }), // Thick White Halo
          offsetY: -15,
          overflow: true,
          placement: feature.getGeometry()?.getType() === 'LineString' ? 'line' : 'point'
      });

      const geometry = feature.getGeometry();
      const type = geometry.getType();

      return new Style({
          stroke: new Stroke({ color: '#91E400', width: 3 }), // Lime Green Border
          fill: new Fill({ color: 'rgba(0, 255, 64, 0.15)' }), // Phosphorescent Green Fill (Transparent)
          text: labelText ? textStyle : undefined,
          image: type === 'Point' ? new CircleStyle({
              radius: 7,
              fill: new Fill({ color: '#00FF40' }), // Phosphorescent Green
              stroke: new Stroke({ color: '#91E400', width: 2 })
          }) : undefined
      });
  };

  const selectedStyleFunction = (feature: any) => {
      if (isDeleteModeRef.current) return new Style({ stroke: new Stroke({ color: '#ef4444', width: 4 }), fill: new Fill({ color: 'rgba(239, 68, 68, 0.3)' }), image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#ef4444' }), stroke: new Stroke({ color: '#fff', width: 2 }) }) });
      const baseStyles = feature.get('layerId') ? kmlStyleFunction(feature) : manualStyleFunction(feature);
      const styles = Array.isArray(baseStyles) ? baseStyles : [baseStyles];
      styles.forEach(s => { const stroke = s.getStroke(); if (stroke) { stroke.setColor('#3b82f6'); stroke.setWidth(3); } });
      return styles;
  };

  const measureStyle = new Style({ fill: new Fill({ color: 'rgba(255, 255, 255, 0.2)' }), stroke: new Stroke({ color: '#3b82f6', width: 2, lineDash: [10, 10] }), image: new CircleStyle({ radius: 5, stroke: new Stroke({ color: '#3b82f6', width: 2 }), fill: new Fill({ color: '#ffffff' }) }) });

  const pointStyle = (feature: any) => new Style({ image: new Icon({ src: 'data:image/svg+xml;utf8,' + encodeURIComponent(blueMarkerSvg), anchor: [0.5, 1], scale: 1 }), text: new Text({ text: feature.get('label') || '', offsetY: -25, font: '11px Roboto, sans-serif', fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: '#000000', width: 3 }) }) });

  const formatLength = (line: LineString | Polygon, unit: string) => {
    const length = getLength(line);
    if (unit === 'km') return (length / 1000).toFixed(2) + ' km';
    if (unit === 'ft') return (length * 3.28084).toFixed(2) + ' ft';
    if (unit === 'mi') return (length * 0.000621371).toFixed(3) + ' mi';
    return length.toFixed(2) + ' m';
  };

  const formatAreaMetric = (polygon: Polygon, unit: string) => {
    const area = getArea(polygon);
    if (unit === 'ha') return (area / 10000).toFixed(2) + ' ha';
    if (unit === 'sqkm') return (area / 1000000).toFixed(2) + ' km²';
    if (unit === 'ac') return (area * 0.000247105).toFixed(2) + ' ac';
    return area.toFixed(2) + ' m²';
  };

  const notifyManualFeatures = () => { if (onManualFeaturesChange) { const features = sourceRef.current.getFeatures().map(f => ({ id: f.getId() as string, label: f.get('label'), type: f.get('type') })); onManualFeaturesChange(features); } };

  const createMeasureTooltip = () => {
    if (measureTooltipElementRef.current) measureTooltipElementRef.current.parentNode?.removeChild(measureTooltipElementRef.current);
    measureTooltipElementRef.current = document.createElement('div');
    measureTooltipElementRef.current.className = 'bg-black/75 text-white px-2 py-1 rounded text-xs whitespace-nowrap border border-white/20 shadow-sm pointer-events-none transform translate-y-[-10px]';
    measureTooltipRef.current = new Overlay({ element: measureTooltipElementRef.current, offset: [0, -15], positioning: 'bottom-center', stopEvent: false, insertFirst: false });
    mapRef.current?.addOverlay(measureTooltipRef.current);
  };

  const createHelpTooltip = () => {
    if (helpTooltipElementRef.current) helpTooltipElementRef.current.parentNode?.removeChild(helpTooltipElementRef.current);
    helpTooltipElementRef.current = document.createElement('div'); helpTooltipElementRef.current.className = 'hidden';
    helpTooltipRef.current = new Overlay({ element: helpTooltipElementRef.current, offset: [15, 0], positioning: 'center-left' });
    mapRef.current?.addOverlay(helpTooltipRef.current);
  };

  const showPointPopup = async (feature: Feature, coordinate: number[]) => {
      const wgs84 = toLonLat(coordinate);
      const zoneCode = selectedZoneRef.current;
      const proj = projectToZone(wgs84[0], wgs84[1], zoneCode);
      const label = feature.get('label') || feature.get('name') || feature.get('Point') || 'Pt';
      setPopupContent({ 
          type: 'POINT', 
          label, 
          x: proj ? proj.x : 0, 
          y: proj ? proj.y : 0, 
          z: '...', 
          lat: wgs84[1], 
          lon: wgs84[0], 
          zone: zoneCode,
          zoneLabel: getZoneLabel(zoneCode)
      });
      setShowDownloadMenu(false);
      overlayRef.current?.setPosition(coordinate);
      const z = await fetchElevation(wgs84[1], wgs84[0]);
      setPopupContent(prev => prev && prev.type === 'POINT' ? { ...prev, z: z } : prev);
  };

  const downloadPointFile = (type: 'TXT' | 'DXF' | 'JSON' | 'KML') => {
      if (!popupContent || popupContent.type !== 'POINT') return;
      const { x, y, z, lat, lon, label, zoneLabel } = popupContent;
      const elevation = typeof z === 'number' ? z : 0;
      let content = "";
      let fileName = `${label.replace(/\s+/g, '_')}`;
      let mimeType = "text/plain";

      if (type === 'TXT') {
          content = createPointText(x, y, elevation, lat, lon, label, zoneLabel);
          fileName += ".txt";
      } else if (type === 'DXF') {
          content = createPointDXF(x, y, elevation, label);
          fileName += ".dxf";
      } else if (type === 'JSON') {
          content = JSON.stringify({ label, zone: zoneLabel, x, y, z: elevation, lat, lon }, null, 2);
          fileName += ".json";
          mimeType = "application/json";
      } else if (type === 'KML') {
          content = createPointKML(lat, lon, label);
          fileName += ".kml";
          mimeType = "application/vnd.google-earth.kml+xml";
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
      setShowDownloadMenu(false);
  };

  const calculateExtentAndNotify = (features: Feature[], sourceExtent: number[], featureId?: string) => {
       if (features.length > 0 && mapRef.current) {
           mapRef.current.getView().fit(sourceExtent, { padding: [50, 50, 50, 50], duration: 800 });
           const wgs = convertToWGS84((sourceExtent[0] + sourceExtent[2]) / 2, (sourceExtent[1] + sourceExtent[3]) / 2);
           const currentRes = mapRef.current.getView().getResolution() || 1;
           const geom = features[0].getGeometry();
           let area = "", perimeter = "";
           if (geom instanceof Polygon) { area = formatAreaMetric(geom, 'sqm'); perimeter = formatLength(geom, 'm'); }
           else if (geom instanceof LineString) perimeter = formatLength(geom, 'm');
           onSelectionComplete({ lat: wgs.lat, lng: wgs.lng, scale: calculateScale(currentRes, parseFloat(wgs.lat)), bounds: sourceExtent, area, perimeter, featureId });
         }
  };

  useImperativeHandle(ref, () => ({
    getLayerFeatures: (layerId) => {
        const features = layerId === 'manual' ? sourceRef.current.getFeatures().concat(pointsSourceRef.current.getFeatures()) : kmlSourceRef.current.getFeatures().filter(f => f.get('layerId') === layerId);
        return features.map(f => {
            const props = f.getProperties();
            const { geometry, layerId: lId, ...rest } = props;
            const geom = f.getGeometry();
            if (geom instanceof Point) { const c = toLonLat(geom.getCoordinates()); rest.Lon = c[0].toFixed(6); rest.Lat = c[1].toFixed(6); }
            else if (geom instanceof Polygon) { rest.Area = getArea(geom).toFixed(2) + " m²"; }
            else if (geom instanceof LineString) { rest.Length = getLength(geom).toFixed(2) + " m"; }
            rest._featureId = f.getId() || `${f.get('type') || 'feat'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            if (!f.getId()) f.setId(rest._featureId);
            const cleanProps: any = {};
            Object.entries(rest).forEach(([k, v]) => { if (k.indexOf('_') !== 0 && typeof v !== 'object') cleanProps[k] = v; });
            cleanProps._featureId = rest._featureId;
            return cleanProps;
        });
    },
    getLayerAvailableFields: (layerId) => {
        const features = kmlSourceRef.current.getFeatures().filter(f => f.get('layerId') === layerId);
        if (features.length === 0) return [];
        const props = features[0].getProperties();
        const blacklist = ['geometry', 'layerId', '_featureId'];
        return Object.keys(props).filter(k => !blacklist.includes(k) && k.indexOf('_') !== 0);
    },
    setLayerLabelField: (layerId, fieldName) => {
        layerLabelFieldsRef.current[layerId] = fieldName;
        kmlSourceRef.current.changed();
    },
    highlightFeature: (id) => {
        const feature = sourceRef.current.getFeatureById(id) || pointsSourceRef.current.getFeatureById(id) || kmlSourceRef.current.getFeatureById(id);
        if (feature) {
            const geom = feature.getGeometry();
            if (geom) {
                mapRef.current?.getView().fit(geom.getExtent(), { padding: [100, 100, 100, 100], duration: 800 });
                selectInteractionRef.current?.getFeatures().clear();
                selectInteractionRef.current?.getFeatures().push(feature);
                if (geom instanceof Point) {
                    showPointPopup(feature, geom.getCoordinates());
                }
            }
        }
    },
    locateUser: () => {
        navigator.geolocation.getCurrentPosition((pos) => {
            const coords = fromLonLat([pos.coords.longitude, pos.coords.latitude]);
            mapRef.current?.getView().animate({ center: coords, zoom: 18 });
            const f = new Feature({ geometry: new Point(coords), label: 'Moi' });
            pointsSourceRef.current.addFeature(f);
            showPointPopup(f, coords);
        });
    },
    flyToLocation: (lon, lat, zoom) => mapRef.current?.getView().animate({ center: fromLonLat([lon, lat]), zoom: zoom || 16 }),
    setMapScale: (scale, centerOnSelection) => {
      if (!mapRef.current) return;
      let center = mapRef.current.getView().getCenter();
      if (centerOnSelection) {
          const sel = selectInteractionRef.current?.getFeatures();
          if (sel && sel.getLength() > 0) { const ext = sel.item(0).getGeometry()?.getExtent(); if (ext) center = [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2]; }
      }
      if (!center) return;
      mapRef.current.getView().animate({ resolution: getResolutionFromScale(scale, toLonLat(center)[1]), center, duration: 600 });
    },
    updateMeasureUnit: (unit) => {
        currentMeasureUnitRef.current = unit;
        activeMeasurementsRef.current.forEach(item => { const g = item.feature.getGeometry(); const el = item.overlay.getElement(); if (!g || !el) return; el.innerHTML = item.type === 'Area' ? formatAreaMetric(g as Polygon, unit) : formatLength(g as LineString, unit); });
    },
    selectLayer: (layerId) => {
        const manualFeature = sourceRef.current.getFeatureById(layerId);
        if (manualFeature) { calculateExtentAndNotify([manualFeature], manualFeature.getGeometry()!.getExtent(), layerId); selectInteractionRef.current?.getFeatures().clear(); selectInteractionRef.current?.getFeatures().push(manualFeature); return; }
        const targetFeatures = layerId === 'manual' ? sourceRef.current.getFeatures() : kmlSourceRef.current.getFeatures().filter(f => f.get('layerId') === layerId);
        if (targetFeatures.length > 0) {
            let extent = targetFeatures[0].getGeometry()!.getExtent();
            targetFeatures.forEach(f => { const e = f.getGeometry()!.getExtent(); extent[0] = Math.min(extent[0], e[0]); extent[1] = Math.min(extent[1], e[1]); extent[2] = Math.max(extent[2], e[2]); extent[3] = Math.max(extent[3], e[3]); });
            calculateExtentAndNotify(targetFeatures, extent);
        }
    },
    loadKML: (file, layerId) => {
      const handle = (text: string) => {
          const features = new KML().readFeatures(text, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
          features.forEach(f => {
              f.set('layerId', layerId);
              if (!f.getId()) f.setId(`kml_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
          });
          kmlSourceRef.current.addFeatures(features);
          if (features.length > 0) {
              let extent = features[0].getGeometry()!.getExtent();
              features.forEach(f => { const e = f.getGeometry()!.getExtent(); extent[0]=Math.min(extent[0],e[0]); extent[1]=Math.min(extent[1],e[1]); extent[2]=Math.max(extent[2],e[2]); extent[3]=Math.max(extent[3],e[3]); });
              calculateExtentAndNotify(features, extent);
          }
      };
      if (file.name.endsWith('.kmz')) { new JSZip().loadAsync(file).then((z: any) => { const k = Object.keys(z.files).find(n => n.endsWith('.kml')); if (k) z.files[k].async("string").then(handle); }); }
      else { const r = new FileReader(); r.onload = (e) => handle(e.target?.result as string); r.readAsText(file); }
    },
    loadShapefile: (file, layerId) => {
      const r = new FileReader(); r.onload = async (e) => {
        if (e.target?.result) { const geojson = await shp(e.target.result); const format = new GeoJSON(); let features: any[] = Array.isArray(geojson) ? geojson.reduce((acc, g) => acc.concat(format.readFeatures(g, { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' })), []) : format.readFeatures(geojson, { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
        features.forEach(f => {
            f.set('layerId', layerId);
            if (!f.getId()) f.setId(`shp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
        });
        kmlSourceRef.current.addFeatures(features);
        if (features.length > 0) { let extent = features[0].getGeometry()!.getExtent(); features.forEach(f => { const e = f.getGeometry()!.getExtent(); extent[0]=Math.min(extent[0],e[0]); extent[1]=Math.min(extent[1],e[1]); extent[2]=Math.max(extent[2],e[2]); extent[3]=Math.max(extent[3],e[3]); }); calculateExtentAndNotify(features, extent); }
      }}; r.readAsArrayBuffer(file);
    },
    loadDXF: (file, zoneCode, layerId) => {
      const r = new FileReader(); r.onload = (e) => {
        const parser = new (window as any).DxfParser(); const dxf = parser.parseSync(e.target?.result as string); const features: Feature[] = [];
        if (dxf?.entities) { for (const entity of dxf.entities) { if (entity.type === 'LINE') { const p1 = projectFromZone(entity.vertices[0].x, entity.vertices[0].y, zoneCode); const p2 = projectFromZone(entity.vertices[1].x, entity.vertices[1].y, zoneCode); if (p1 && p2) {
            const f = new Feature(new LineString([fromLonLat(p1), fromLonLat(p2)]));
            f.setId(`dxf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
            features.push(f);
        } } } }
        features.forEach(f => f.set('layerId', layerId)); kmlSourceRef.current.addFeatures(features);
        if (features.length > 0) { let extent = features[0].getGeometry()!.getExtent(); features.forEach(f => { const e = f.getGeometry()!.getExtent(); extent[0]=Math.min(extent[0],e[0]); extent[1]=Math.min(extent[1],e[1]); extent[2]=Math.max(extent[2],e[2]); extent[3]=Math.max(extent[3],e[3]); }); calculateExtentAndNotify(features, extent); }
      }; r.readAsText(file);
    },
    loadGeoJSON: (file, layerId) => {
      const r = new FileReader(); r.onload = (e) => {
        const features = new GeoJSON().readFeatures(e.target?.result as string, { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
        features.forEach(f => {
            f.set('layerId', layerId);
            if (!f.getId()) f.setId(`json_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
        });
        kmlSourceRef.current.addFeatures(features);
        if (features.length > 0) { let extent = features[0].getGeometry()!.getExtent(); features.forEach(f => { const e = f.getGeometry()!.getExtent(); extent[0]=Math.min(extent[0],e[0]); extent[1]=Math.min(extent[1],e[1]); extent[2]=Math.max(extent[2],e[2]); extent[3]=Math.max(extent[3],e[3]); }); calculateExtentAndNotify(features, extent); }
      }; r.readAsText(file);
    },
    loadExcelPoints: (layerId, points) => {
        const features = points.map((pt, idx) => {
            const { _x, _y, ...attrs } = pt;
            const f = new Feature({ geometry: new Point(fromLonLat([_x, _y])), ...attrs });
            f.set('layerId', layerId);
            f.setId(`${layerId}_${idx}`);
            return f;
        });
        kmlSourceRef.current.addFeatures(features);
        if (features.length > 0) {
            const extent = kmlSourceRef.current.getExtent();
            mapRef.current?.getView().fit(extent, { padding: [100, 100, 100, 100], duration: 800 });
            calculateExtentAndNotify(features, extent, layerId);
        }
    },
    addManualPoint: (x, y, label) => {
        const coords = fromLonLat([x, y]);
        const feature = new Feature({ geometry: new Point(coords), label: label });
        feature.setId(`pt_${Date.now()}`);
        pointsSourceRef.current.addFeature(feature); 
        mapRef.current?.getView().animate({ center: coords, zoom: 16 });
        showPointPopup(feature, coords);
    },
    setMeasureTool: (type, unit) => {
        if (drawInteractionRef.current) mapRef.current?.removeInteraction(drawInteractionRef.current);
        currentMeasureUnitRef.current = unit; createMeasureTooltip(); createHelpTooltip();
        const draw = new Draw({ source: measureSourceRef.current, type: type === 'MeasureLength' ? 'LineString' : 'Polygon', style: measureStyle });
        draw.on('drawstart', (evt) => {
            sketchRef.current = evt.feature;
            pointerMoveListenerRef.current = mapRef.current?.on('pointermove', (e) => {
                if (e.dragging) return;
                const g = sketchRef.current.getGeometry();
                if (g instanceof Polygon) { if (measureTooltipElementRef.current) measureTooltipElementRef.current.innerHTML = formatAreaMetric(g, currentMeasureUnitRef.current); measureTooltipRef.current?.setPosition(g.getInteriorPoint().getCoordinates()); }
                else if (g instanceof LineString) { if (measureTooltipElementRef.current) measureTooltipElementRef.current.innerHTML = formatLength(g, currentMeasureUnitRef.current); measureTooltipRef.current?.setPosition(g.getLastCoordinate()); }
            });
        });
        draw.on('drawend', () => { if (measureTooltipElementRef.current) measureTooltipElementRef.current.className = 'bg-blue-600 text-white px-2 py-1 rounded text-xs whitespace-nowrap border'; if (sketchRef.current) activeMeasurementsRef.current.push({ feature: sketchRef.current, overlay: measureTooltipRef.current!, type: type === 'MeasureLength' ? 'Length' : 'Area' }); sketchRef.current = null; measureTooltipElementRef.current = null; createMeasureTooltip(); unByKey(pointerMoveListenerRef.current); });
        mapRef.current?.addInteraction(draw); drawInteractionRef.current = draw;
    },
    setDrawTool: (type) => {
      if (drawInteractionRef.current) mapRef.current?.removeInteraction(drawInteractionRef.current);
      isDeleteModeRef.current = (type === 'Delete');
      if (['Edit', 'Delete'].includes(type || '')) { modifyInteractionRef.current?.setActive(type==='Edit'); selectInteractionRef.current?.setActive(true); snapInteractionRef.current?.setActive(type==='Edit'); return; }
      if (!type) { modifyInteractionRef.current?.setActive(false); selectInteractionRef.current?.setActive(false); return; }
      const draw = new Draw({ source: type === 'Point' ? pointsSourceRef.current : sourceRef.current, type: type === 'Rectangle' ? 'Circle' : (type === 'Line' ? 'LineString' : (type === 'Point' ? 'Point' : 'Polygon')), geometryFunction: type === 'Rectangle' ? createBox() : undefined });
      draw.on('drawend', (e) => {
        const id = `${type}_${Date.now()}`; e.feature.setId(id);
        const label = `${type} ${featureCounters.current[type === 'Rectangle' ? 'Rectangle' : type]++}`;
        e.feature.set('label', label); e.feature.set('type', type);
        setTimeout(notifyManualFeatures, 100);
        if (type === 'Point') showPointPopup(e.feature, (e.feature.getGeometry() as Point).getCoordinates());
        else calculateExtentAndNotify([e.feature], e.feature.getGeometry()!.getExtent(), id);
      });
      mapRef.current?.addInteraction(draw); drawInteractionRef.current = draw;
    },
    clearAll: () => { sourceRef.current.clear(); kmlSourceRef.current.clear(); pointsSourceRef.current.clear(); measureSourceRef.current.clear(); activeMeasurementsRef.current = []; overlayRef.current?.setPosition(undefined); notifyManualFeatures(); layerLabelFieldsRef.current = {}; },
    undo: () => { const f = sourceRef.current.getFeatures(); if (f.length > 0) sourceRef.current.removeFeature(f[f.length-1]); notifyManualFeatures(); },
    deleteSelectedFeature: () => { const s = selectInteractionRef.current?.getFeatures(); if (s) { s.forEach(f => { if (sourceRef.current.hasFeature(f)) sourceRef.current.removeFeature(f); if (pointsSourceRef.current.hasFeature(f)) pointsSourceRef.current.removeFeature(f); if (kmlSourceRef.current.hasFeature(f)) kmlSourceRef.current.removeFeature(f); }); s.clear(); notifyManualFeatures(); } },
    getMapCanvas: async (targetScale, layerId) => {
      if (!mapRef.current) return null;
      let expFeats = layerId === 'manual' ? sourceRef.current.getFeatures() : kmlSourceRef.current.getFeatures().filter(f => f.get('layerId') === layerId);
      if (expFeats.length === 0 && layerId !== 'manual') { const f = sourceRef.current.getFeatureById(layerId!); if (f) expFeats = [f]; }
      if (expFeats.length === 0) return null;
      let extent = expFeats[0].getGeometry()!.getExtent();
      expFeats.forEach(f => { const e = f.getGeometry()!.getExtent(); extent[0]=Math.min(extent[0],e[0]); extent[1]=Math.min(extent[1],e[1]); extent[2]=Math.max(extent[2],e[2]); extent[3]=Math.max(extent[3],e[3]); });
      const view = mapRef.current.getView(); const res = targetScale ? getResolutionFromScale(targetScale, toLonLat([(extent[0]+extent[2])/2,(extent[1]+extent[3])/2])[1]) : view.getResolution()!;
      const w = Math.ceil((extent[2]-extent[0])/res); const h = Math.ceil((extent[3]-extent[1])/res);
      const originalSize = mapRef.current.getSize();
      mapRef.current.setSize([w, h]); view.setResolution(res); view.setCenter([(extent[0]+extent[2])/2,(extent[1]+extent[3])/2]);
      return new Promise((resov) => { mapRef.current?.once('rendercomplete', () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); if (ctx) { ctx.clip(); mapElement.current?.querySelectorAll('.ol-layer canvas').forEach((cv: any) => ctx.drawImage(cv, 0, 0)); } mapRef.current?.setSize(originalSize); resov({ canvas: c, extent }); }); mapRef.current?.renderSync(); });
    }
  }));

  useEffect(() => {
    const overlay = new Overlay({ element: popupRef.current!, autoPan: true, positioning: 'bottom-center', offset: [0, -25] });
    overlayRef.current = overlay;
    const baseLayer = new TileLayer({ source: new XYZ({ url: `https://mt{0-3}.google.com/vt/lyrs=${mapType === 'satellite' ? 's' : 'y'}&x={x}&y={y}&z={z}`, maxZoom: 22, crossOrigin: 'anonymous' }) });
    baseLayerRef.current = baseLayer;
    const select = new Select({ layers: [ new VectorLayer({ source: sourceRef.current }), new VectorLayer({ source: pointsSourceRef.current }), new VectorLayer({ source: kmlSourceRef.current }) ], style: selectedStyleFunction });
    select.on('select', (e) => { 
        if (e.selected.length) {
            const feature = e.selected[0];
            const id = feature.getId() as string;
            const wgs = toLonLat((feature.getGeometry() as any).getExtent().slice(0, 2));
            const currentRes = mapRef.current!.getView().getResolution() || 1;
            onSelectionComplete({ 
                lat: wgs[1].toFixed(6), 
                lng: wgs[0].toFixed(6), 
                scale: calculateScale(currentRes, wgs[1]), 
                bounds: feature.getGeometry()!.getExtent(),
                featureId: id
            });
            if (feature.getGeometry() instanceof Point) {
                showPointPopup(feature, (feature.getGeometry() as Point).getCoordinates());
            } else {
                overlayRef.current?.setPosition(undefined);
            }
            if (isDeleteModeRef.current) {
                e.selected.forEach(f => { if (sourceRef.current.hasFeature(f)) sourceRef.current.removeFeature(f); if (pointsSourceRef.current.hasFeature(f)) pointsSourceRef.current.removeFeature(f); if (kmlSourceRef.current.hasFeature(f)) kmlSourceRef.current.removeFeature(f); });
                select.getFeatures().clear(); notifyManualFeatures();
            }
        }
    });
    selectInteractionRef.current = select;
    const modify = new Modify({ source: sourceRef.current }); modify.setActive(false); modifyInteractionRef.current = modify;
    const snap = new Snap({ source: sourceRef.current }); snap.setActive(false); snapInteractionRef.current = snap;
    const map = new Map({ target: mapElement.current!, layers: [ baseLayer, new VectorLayer({ source: kmlSourceRef.current, style: kmlStyleFunction }), new VectorLayer({ source: pointsSourceRef.current, style: pointStyle }), new VectorLayer({ source: measureSourceRef.current, style: measureStyle }), new VectorLayer({ source: sourceRef.current, style: manualStyleFunction }) ], view: new View({ center: fromLonLat([-7.5898, 33.5731]), zoom: 6, maxZoom: 22 }), controls: [new Zoom(), new ScaleLine()], overlays: [overlay] });
    map.addInteraction(select); map.addInteraction(modify); map.addInteraction(snap);
    map.on('pointermove', (e) => { if (e.dragging) return; const c = toLonLat(e.coordinate); if (onMouseMove) onMouseMove(`${c[0]>=0?'E':'W'}${Math.abs(c[0]).toFixed(4)}`, `${c[1]>=0?'N':'S'}${Math.abs(c[1]).toFixed(4)}`); mapElement.current!.style.cursor = map.hasFeatureAtPixel(e.pixel) ? 'pointer' : ''; });
    map.on('click', (e) => { 
        if (drawInteractionRef.current) return; 
        const f = map.forEachFeatureAtPixel(e.pixel, (ft) => ft); 
        if (f instanceof Feature && f.getGeometry() instanceof Point) {
            showPointPopup(f, (f.getGeometry() as Point).getCoordinates());
        } else {
            overlayRef.current?.setPosition(undefined);
            setShowDownloadMenu(false);
        }
    });
    mapRef.current = map; return () => map.setTarget(undefined);
  }, []);

  useEffect(() => { if (baseLayerRef.current) baseLayerRef.current.setSource(new XYZ({ url: `https://mt{0-3}.google.com/vt/lyrs=${mapType === 'satellite' ? 's' : 'y'}&x={x}&y={y}&z={z}`, maxZoom: 22, crossOrigin: 'anonymous' })); }, [mapType]);

  return (
      <div ref={mapElement} className="w-full h-full bg-slate-50 relative overflow-hidden">
          <div ref={popupRef} className="absolute bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] p-0 z-50 min-w-[210px] border border-neutral-100 overflow-visible transform -translate-x-1/2">
             {popupContent && popupContent.type === 'POINT' && (
                 <div className="flex flex-col text-[12px] custom-modal-font">
                     <div className="px-3 py-2 border-b flex justify-between items-center bg-white rounded-t-xl">
                         <span className="font-bold text-neutral-800 text-sm">{popupContent.label}</span>
                         <button onClick={() => overlayRef.current?.setPosition(undefined)} className="text-red-600 hover:text-red-800 transition-colors">
                            <i className="fas fa-times text-sm"></i>
                         </button>
                     </div>
                     
                     <div className="p-3 space-y-3 bg-white">
                         <div className="space-y-0.5">
                             <div className="text-blue-600 font-bold text-[10px] mb-1">{popupContent.zoneLabel}</div>
                             <div className="grid grid-cols-[16px_1fr] gap-x-1 text-neutral-700 leading-tight">
                                 <span className="font-bold text-neutral-300">X</span>
                                 <span className="font-mono text-[11px]">{popupContent.x.toFixed(2)}</span>
                                 <span className="font-bold text-neutral-300">Y</span>
                                 <span className="font-mono text-[11px]">{popupContent.y.toFixed(2)}</span>
                                 <span className="font-bold text-neutral-300">Z</span>
                                 <span className="font-bold text-emerald-600 font-mono text-[11px]">{popupContent.z}</span>
                             </div>
                         </div>

                         <div className="space-y-0.5 pt-2 border-t border-neutral-50">
                             <div className="text-neutral-400 font-bold text-[10px] mb-1 uppercase tracking-wider">WGS 84</div>
                             <div className="grid grid-cols-[16px_1fr] gap-x-1 text-neutral-600 leading-tight">
                                 <span className="text-neutral-300 font-bold">L</span>
                                 <span className="font-mono text-[11px]">{popupContent.lat.toFixed(6)}</span>
                                 <span className="text-neutral-300 font-bold">G</span>
                                 <span className="font-mono text-[11px]">{popupContent.lon.toFixed(6)}</span>
                             </div>
                         </div>
                     </div>

                     <div className="relative border-t border-neutral-50">
                         <button 
                            onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                            className="w-full px-3 py-2.5 text-blue-600 font-bold text-[11px] flex justify-between items-center bg-white hover:bg-blue-50/50 transition-colors rounded-b-xl uppercase tracking-wider"
                         >
                             <span>Download</span>
                             <i className={`fas fa-chevron-right transition-transform text-[9px] ${showDownloadMenu ? 'rotate-90' : ''}`}></i>
                         </button>
                         
                         {showDownloadMenu && (
                             <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-neutral-100 overflow-hidden z-[60] animate-slide-up">
                                 <button onClick={() => downloadPointFile('TXT')} className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2 border-b border-neutral-50">
                                     <i className="far fa-file-lines text-neutral-400 w-4"></i>
                                     <span className="font-bold text-neutral-700">TXT File</span>
                                 </button>
                                 <button onClick={() => downloadPointFile('DXF')} className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2 border-b border-neutral-50">
                                     <i className="fas fa-file-code text-blue-500 w-4"></i>
                                     <span className="font-bold text-neutral-700">DXF AutoCAD</span>
                                 </button>
                                 <button onClick={() => downloadPointFile('JSON')} className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2 border-b border-neutral-50">
                                     <i className="fas fa-code text-emerald-500 w-4"></i>
                                     <span className="font-bold text-neutral-700">JSON Data</span>
                                 </button>
                                 <button onClick={() => downloadPointFile('KML')} className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center gap-2">
                                     <i className="fas fa-globe text-orange-500 w-4"></i>
                                     <span className="font-bold text-neutral-700">KML Google Earth</span>
                                 </button>
                             </div>
                         )}
                     </div>
                 </div>
             )}
          </div>
      </div>
  );
});

export default MapComponent;
