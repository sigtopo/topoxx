
import React, { useState, useRef, useEffect } from 'react';
import MapComponent, { MapComponentRef } from './components/MapComponent';
import { projectFromZone, fetchLocationName, searchPlaces, SearchResult } from './services/geoService';

declare const UTIF: any;
declare const JSZip: any;
declare const XLSX: any;

interface ExportData {
  lat: string;
  lng: string;
  scale: string;
  bounds: number[];
  area?: string;
  perimeter?: string;
  projection?: string;
  featureId?: string;
}

interface ExportResult {
    name: string;
    date: string;
    size: string;
    coords: string;
}

interface LayerInfo {
    id: string;
    name: string;
    type: 'KML' | 'SHP' | 'DXF' | 'GeoJSON' | 'XLS';
}

interface ManualFeatureInfo {
    id: string;
    label: string;
    type: 'Polygon' | 'Rectangle' | 'Line' | 'Point';
}

type WorkflowStep = 'IDLE' | 'SELECTED' | 'PROCESSING' | 'DONE';
type ToolType = 'Rectangle' | 'Polygon' | 'Point' | 'Line' | 'Pan' | 'MeasureLength' | 'MeasureArea' | 'Edit' | 'Delete' | null;

const BASEMAPS = [
    { id: 'google_sat', label: 'Satellite (Google)', icon: '🛰️' },
    { id: 'google_hybrid', label: 'Satellite + Labels (Default)', icon: '🛰️📍' },
    { id: 'google_roads', label: 'Roads (Google)', icon: '🛣️' },
    { id: 'google_terrain', label: 'Terrain (Google)', icon: '⛰️' },
    { id: 'osm_standard', label: 'OSM Standard', icon: '🗺️' },
    { id: 'osm_hot', label: 'OSM Humanitarian', icon: '🆘' },
    { id: 'esri_sat', label: 'Aerial Imagery (ESRI)', icon: '🛰️' },
    { id: 'esri_streets', label: 'Streets (ESRI)', icon: '🛣️' },
    { id: 'esri_topo', label: 'Topographic (ESRI)', icon: '🗺️' },
    { id: 'esri_terrain', label: 'Terrain (ESRI)', icon: '⛰️' },
    { id: 'esri_shaded', label: 'Shaded Relief (ESRI)', icon: '🌋' },
    { id: 'usgs_topo', label: 'USGS Topographic', icon: '🗺️' },
    { id: 'opentopo', label: 'OpenTopo Map', icon: '🗺️🌍' },
    { id: 'morocco_topo', label: 'Morocco Topographic', icon: '🇲🇦' }
];

const EXPORT_SCALES = [
  { label: '10000 km', value: 1000000000 },
  { label: '5000 km', value: 500000000 },
  { label: '2000 km', value: 200000000 },
  { label: '1000 km', value: 100000000 },
  { label: '500 km', value: 50000000 },
  { label: '200 km', value: 20000000 },
  { label: '100 km', value: 10000000 },
  { label: '50 km', value: 5000000 },
  { label: '25 km', value: 2500000 },
  { label: '20 km', value: 2000000 },
  { label: '10 km', value: 1000000 },
  { label: '5 km', value: 500000 },
  { label: '2 km', value: 200000 },
  { label: '1 km', value: 100000 },
  { label: '500 m', value: 50000 },
  { label: '250 m', value: 25000 },
  { label: '200 m', value: 20000 },
  { label: '100 m', value: 10000 },
  { label: '50 m', value: 5000 },
  { label: '20 m', value: 2000 },
  { label: '10 m', value: 1000 },
  { label: '5 m', value: 500 }
];

const MAP_SCALES = [
    { label: '1:500', value: 500 },
    { label: '1:1000', value: 1000 },
    { label: '1:2000', value: 2000 },
    { label: '1:2500', value: 2500 },
    { label: '1:5000', value: 5000 },
    { label: '1:10000', value: 10000 },
    { label: '1:25000', value: 25000 },
    { label: '1:50000', value: 50000 },
    { label: '1:100000', value: 100000 },
    { label: '1:250000', value: 250000 }
];

const ZONES = [
  { code: 'EPSG:4326', label: 'WGS 84' },
  { code: 'EPSG:26191', label: 'Zone 1 (Nord Maroc)' },
  { code: 'EPSG:26192', label: 'Zone 2 (Sud Maroc)' },
  { code: 'EPSG:26194', label: 'Zone 3 (Sahara Nord)' },
  { code: 'EPSG:26195', label: 'Zone 4 (Sahara Sud)' },
];

const LENGTH_UNITS = [
    { value: 'm', label: 'Mètres (m)' },
    { value: 'km', label: 'Kilomètres (km)' },
    { value: 'ft', label: 'Feet (ft)' },
    { value: 'mi', label: 'Miles (mi)' },
];

const AREA_UNITS = [
    { value: 'sqm', label: 'Mètres carrés (m²)' },
    { value: 'ha', label: 'Hectares (ha)' },
    { value: 'sqkm', label: 'Kilomètres carrés (km²)' },
    { value: 'ac', label: 'Acres (ac)' },
];

const CloseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button onClick={onClick} className="bg-[#cc3333] hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center transition-colors shadow-sm">
        <i className="fas fa-times text-[10px]"></i>
    </button>
);

const DeveloperFooter: React.FC = () => (
    <div className="mt-8 pt-6 border-t border-neutral-200 text-center">
        <p className="text-[11px] font-bold text-neutral-700 mb-1">réalisé par Jilit Mostafa</p>
        <p className="text-[10px] text-neutral-600 mb-4 flex items-center justify-center gap-1">
            jilitsig@gmail.com | +212 668 09 02 85 <i className="fas fa-phone-alt text-pink-600 text-[9px]"></i>
        </p>
        
        <div className="flex justify-center gap-4 mb-4">
            <a href="#" className="text-blue-600 text-base hover:scale-110 transition-transform"><i className="fab fa-facebook"></i></a>
            <a href="#" className="text-pink-600 text-base hover:scale-110 transition-transform"><i className="fab fa-instagram"></i></a>
            <a href="#" className="text-blue-800 text-base hover:scale-110 transition-transform"><i className="fab fa-linkedin"></i></a>
            <a href="#" className="text-green-500 text-base hover:scale-110 transition-transform"><i className="fab fa-whatsapp"></i></a>
        </div>

        <p className="text-[10px] text-neutral-400 font-medium mb-3">Version 1.0 | © 2026 Tous droits réservés</p>
        
        <div className="flex justify-center">
            <img src="https://flagpedia.net/data/flags/emoji/twitter/256x256/ma.png" alt="Maroc" className="h-5 w-auto" />
        </div>
    </div>
);

const App: React.FC = () => {
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [step, setStep] = useState<WorkflowStep>('IDLE');
  const [activeTool, setActiveTool] = useState<ToolType>(null);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("");
  const [selectedScale, setSelectedScale] = useState<number>(1000);
  const [basemapId, setBasemapId] = useState<string>('google_hybrid');
  const [basemapPanelOpen, setBasemapPanelOpen] = useState(false);
  
  const [measureUnit, setMeasureUnit] = useState<string>('m');
  const [tocOpen, setTocOpen] = useState(false); 
  const [toolboxOpen, setToolboxOpen] = useState(false); 
  const [showGoToPanel, setShowGoToPanel] = useState(false); 
  const [showExcelPanel, setShowExcelPanel] = useState(false); 
  const [showExcelHelp, setShowExcelHelp] = useState(false); 
  
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  
  const [selectedZone, setSelectedZone] = useState<string>('EPSG:26191'); 
  const [selectedExcelFile, setSelectedExcelFile] = useState<File | null>(null);
  
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [manualFeatures, setManualFeatures] = useState<ManualFeatureInfo[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>('manual');

  const [showAttrTable, setShowAttrTable] = useState(false);
  const [attrTableData, setAttrTableData] = useState<any[]>([]);
  const [attrTableTitle, setAttrTableTitle] = useState("");
  const [selectedAttrFeatureId, setSelectedAttrFeatureId] = useState<string | null>(null);

  const [labelPicker, setLabelPicker] = useState<{ layerId: string, fields: string[] } | null>(null);

  const [locationName, setLocationName] = useState<string>("location");
  const [mouseCoords, setMouseCoords] = useState({ x: 'E0.0000', y: 'N0.0000' });
  const [manualX, setManualX] = useState<string>('');
  const [manualY, setManualY] = useState<string>('');
  const [pointCounter, setPointCounter] = useState<number>(1);
  const [countdown, setCountdown] = useState<number>(0);
  
  const mapComponentRef = useRef<MapComponentRef>(null);
  const kmlInputRef = useRef<HTMLInputElement>(null);
  const shpInputRef = useRef<HTMLInputElement>(null);
  const dxfInputRef = useRef<HTMLInputElement>(null);
  const geojsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (exportData) {
        fetchLocationName(parseFloat(exportData.lat), parseFloat(exportData.lng))
            .then(name => setLocationName(name));
    }
  }, [exportData]);

  const handleScaleChange = (newScale: number) => {
    setSelectedScale(newScale);
    mapComponentRef.current?.setMapScale(newScale, true);
    if (exportData) {
        startClipping(newScale);
    }
  };

  const handleLayerSelect = (layerId: string) => {
      setSelectedLayerId(layerId);
      mapComponentRef.current?.selectLayer(layerId);
      if (layerId === 'manual' && (!exportData || !exportData.area)) {
          if (manualFeatures.length === 0) {
             setStep('IDLE');
          }
      }
      if (manualFeatures.find(f => f.id === layerId)) {
          setStep('SELECTED');
          setToolboxOpen(true);
      }
  };

  const openAttributeTable = (layer: LayerInfo | 'manual') => {
      if (!mapComponentRef.current) return;
      const id = typeof layer === 'string' ? 'manual' : layer.id;
      const name = typeof layer === 'string' ? 'Dessins Manuels' : layer.name;
      const data = mapComponentRef.current.getLayerFeatures(id);
      setAttrTableData(data);
      setAttrTableTitle(name);
      setShowAttrTable(true);
  };

  const handleRowClick = (row: any) => {
      if (row._featureId) {
          setSelectedAttrFeatureId(row._featureId);
          mapComponentRef.current?.highlightFeature(row._featureId);
      }
  };

  const openLabelPicker = (layer: LayerInfo) => {
      if (!mapComponentRef.current) return;
      const fields = mapComponentRef.current.getLayerAvailableFields(layer.id);
      setLabelPicker({ layerId: layer.id, fields });
  };

  const selectLabelField = (fieldName: string) => {
      if (labelPicker && mapComponentRef.current) {
          mapComponentRef.current.setLayerLabelField(labelPicker.layerId, fieldName);
          setLabelPicker(null);
      }
  };

  const toggleTool = (tool: ToolType) => {
    const newTool = activeTool === tool ? null : tool;
    setActiveTool(newTool);
    if (newTool === 'MeasureLength' && !LENGTH_UNITS.find(u => u.value === measureUnit)) {
        setMeasureUnit('m');
    } else if (newTool === 'MeasureArea' && !AREA_UNITS.find(u => u.value === measureUnit)) {
        setMeasureUnit('sqm');
    }
    if (newTool === 'MeasureLength' || newTool === 'MeasureArea') {
        mapComponentRef.current?.setMeasureTool(newTool, measureUnit);
    } else {
        mapComponentRef.current?.setDrawTool(newTool === 'Pan' ? null : newTool);
    }
    if (newTool && !['Pan', 'MeasureLength', 'MeasureArea', 'Point', 'Edit', 'Delete'].includes(newTool)) {
        setSelectedLayerId('manual');
    }
  };

  const handleUnitChange = (unit: string) => {
      setMeasureUnit(unit);
      mapComponentRef.current?.updateMeasureUnit(unit);
      if (activeTool === 'MeasureLength' || activeTool === 'MeasureArea') {
          mapComponentRef.current?.setMeasureTool(activeTool, unit);
      }
  };

  const handleFileClick = (ref: React.RefObject<HTMLInputElement>) => {
      ref.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'KML' | 'SHP' | 'DXF' | 'GeoJSON' | 'XLS') => {
      const file = e.target.files?.[0];
      if (!file || !mapComponentRef.current) return;

      if (type !== 'XLS') {
          setActiveTool('Pan'); 
          mapComponentRef.current.setDrawTool(null);
          const layerId = `layer_${Date.now()}`;
          const newLayer: LayerInfo = { id: layerId, name: file.name, type };
          setLayers(prev => [...prev, newLayer]);
          setSelectedLayerId(layerId);
          setToolboxOpen(true); 

          if (type === 'KML') mapComponentRef.current.loadKML(file, layerId);
          if (type === 'SHP') mapComponentRef.current.loadShapefile(file, layerId);
          if (type === 'DXF') mapComponentRef.current.loadDXF(file, selectedZone, layerId);
          if (type === 'GeoJSON') mapComponentRef.current.loadGeoJSON(file, layerId);
      }
      if (type === 'XLS') setSelectedExcelFile(file);
      e.target.value = '';
  };

  const parseCoordinateValue = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return NaN;
    let strVal = String(val).trim().replace(/\s/g, '').replace(/\u00A0/g, '').replace(',', '.');
    return parseFloat(strVal);
  };

  const processExcelFile = () => {
    if (!selectedExcelFile || !mapComponentRef.current) {
        alert("Veuillez sélectionner un fichier Excel.");
        return;
    }
    setActiveTool(null);
    mapComponentRef.current.setDrawTool(null);
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = e.target?.result;
        if (!data) return;
        try {
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: "" });
            const validPoints: any[] = [];
            jsonData.forEach((row: any) => {
                const xKey = Object.keys(row).find(k => /^(x|lng|lon|longitude|easting)$/i.test(k));
                const yKey = Object.keys(row).find(k => /^(y|lat|latitude|northing)$/i.test(k));
                const labelKey = Object.keys(row).find(k => /^(id|name|nom|label|point)$/i.test(k));
                if (xKey && yKey) {
                    const rawX = parseCoordinateValue(row[xKey]);
                    const rawY = parseCoordinateValue(row[yKey]);
                    if (!isNaN(rawX) && !isNaN(rawY)) {
                        const wgs84 = projectFromZone(rawX, rawY, selectedZone);
                        if (wgs84) {
                            validPoints.push({ 
                                ...row, 
                                _x: wgs84[0], 
                                _y: wgs84[1], 
                                label: labelKey ? String(row[labelKey]) : undefined 
                            });
                        }
                    }
                }
            });
            if (validPoints.length > 0) {
                const layerId = `excel_${Date.now()}`;
                const newLayer: LayerInfo = { id: layerId, name: selectedExcelFile.name, type: 'XLS' };
                setLayers(prev => [...prev, newLayer]);
                setSelectedLayerId(layerId);
                mapComponentRef.current?.loadExcelPoints(layerId, validPoints);
                setSelectedExcelFile(null);
                setShowExcelPanel(false);
                setToolboxOpen(true);
            } else { alert("Aucun point valide trouvé."); }
        } catch (err) { alert("Erreur lors du traitement."); }
    };
    reader.readAsArrayBuffer(selectedExcelFile);
  };

  const handleManualAddPoint = () => {
    const x = parseCoordinateValue(manualX);
    const y = parseCoordinateValue(manualY);
    if (isNaN(x) || isNaN(y)) { alert("Coordonnées invalides."); return; }
    const wgs84 = projectFromZone(x, y, selectedZone); 
    if (!wgs84) { alert("Hors zone أو erreur de projection."); return; }
    const label = `pt ${pointCounter.toString().padStart(2, '0')}`;
    mapComponentRef.current?.addManualPoint(wgs84[0], wgs84[1], label);
    setPointCounter(prev => prev + 1);
    setManualX(""); setManualY("");
  };

  const handleSearchInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchQuery(val);
      if (val.length > 2) {
          const results = await searchPlaces(val);
          setSearchResults(results);
      } else { setSearchResults([]); }
  };

  const handleSelectSearchResult = (result: SearchResult) => {
      mapComponentRef.current?.flyToLocation(parseFloat(result.lon), parseFloat(result.lat), 16);
      setSearchResults([]); setSearchQuery(""); setShowSearchPanel(false);
  };

  const startClipping = async (scaleOverride?: number) => {
    if (!mapComponentRef.current || !exportData) return;
    const currentScale = scaleOverride || selectedScale;
    setStep('PROCESSING'); setCountdown(5);
    const timer = setInterval(() => setCountdown((prev) => prev <= 1 ? (clearInterval(timer), 0) : prev - 1), 1000);
    setTimeout(async () => {
        try {
            const result = await mapComponentRef.current!.getMapCanvas(currentScale, selectedLayerId);
            clearInterval(timer); 
            if (!result) throw new Error("Empty Canvas");
            const { canvas, extent } = result;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const tiffBuffer = UTIF.encodeImage(imgData.data, canvas.width, canvas.height);
            const proj4lib = (await import('proj4')).default; 
            
            // World File Calculation (Geographic - WGS84)
            const minCorner = proj4lib('EPSG:3857', 'EPSG:4326', [extent[0], extent[1]]);
            const maxCorner = proj4lib('EPSG:3857', 'EPSG:4326', [extent[2], extent[3]]);
            const pixelWidthX = (maxCorner[0] - minCorner[0]) / canvas.width;
            const pixelHeightY = (maxCorner[1] - minCorner[1]) / canvas.height;
            
            // TFW: X-Scale, Rotation Y, Rotation X, Y-Scale (Negative), Top-Left Longitude, Top-Left Latitude
            const tfw = [
                pixelWidthX.toFixed(14), 
                "0.00000000000000", 
                "0.00000000000000", 
                (-pixelHeightY).toFixed(14), 
                minCorner[0].toFixed(14), 
                maxCorner[1].toFixed(14)
            ].join('\n');

            const prj = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
            
            const date = new Date();
            const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear().toString().slice(-2)}`;
            const fullDateStr = date.toLocaleDateString('fr-FR');
            const lat = parseFloat(exportData.lat); const lng = parseFloat(exportData.lng);
            const coordStr = `${lat >= 0 ? 'n' : 's'}${Math.floor(Math.abs(lat))}_${lng >= 0 ? 'e' : 'w'}${Math.floor(Math.abs(lng)).toString().padStart(3, '0')}`;
            const scaleObj = EXPORT_SCALES.find(s => s.value === currentScale);
            const scaleStr = scaleObj ? scaleObj.label.replace(/\s+/g, '') : currentScale.toString();
            
            const baseName = `${locationName}_${scaleStr}_${coordStr}_${dateStr}_topoma`;
            const zip = new JSZip();
            zip.file(`${baseName}.tif`, tiffBuffer); 
            zip.file(`${baseName}.tfw`, tfw); 
            zip.file(`${baseName}.prj`, prj);
            
            const blob = await zip.generateAsync({ type: 'blob' });
            const sizeInMB = (blob.size / (1024 * 1024)).toFixed(2);
            setZipBlob(blob); setFileName(`${baseName}.zip`);
            setExportResult({ name: `${baseName}.tif`, date: fullDateStr, size: parseFloat(sizeInMB) < 1 ? `${(blob.size / 1024).toFixed(0)} KB` : `${sizeInMB} MB`, coords: `Lat:${lat.toFixed(4)}, Lon:${lng.toFixed(4)}` });
            setStep('DONE');
        } catch (e) { 
            console.error(e);
            setStep('IDLE'); 
            clearInterval(timer); 
            alert("Erreur lors du traitement. Vérifiez que la zone est entièrement chargée."); 
        }
    }, 1000);
  };

  const downloadFile = () => {
    if (!zipBlob) return;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url); setStep('DONE'); 
  };

  const resetAll = () => {
    mapComponentRef.current?.clearAll(); mapComponentRef.current?.setDrawTool(null);
    setExportData(null); setExportResult(null); setStep('IDLE'); setActiveTool(null);
    setZipBlob(null); setSelectedExcelFile(null); setLayers([]); setManualFeatures([]);
    setSelectedLayerId('manual'); setPointCounter(1); setLocationName("location");
    setSearchQuery(""); setSearchResults([]); 
    setShowAttrTable(false); setAttrTableData([]); setLabelPicker(null);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-neutral-200 overflow-hidden font-sans text-neutral-800">
      
      <input type="file" accept=".kml,.kmz" className="hidden" ref={kmlInputRef} onChange={(e) => handleFileUpload(e, 'KML')} />
      <input type="file" accept=".zip" className="hidden" ref={shpInputRef} onChange={(e) => handleFileUpload(e, 'SHP')} />
      <input type="file" accept=".dxf" className="hidden" ref={dxfInputRef} onChange={(e) => handleFileUpload(e, 'DXF')} />
      <input type="file" accept=".geojson,.json" className="hidden" ref={geojsonInputRef} onChange={(e) => handleFileUpload(e, 'GeoJSON')} />
      <input type="file" accept=".xlsx, .xls" className="hidden" ref={excelInputRef} onChange={(e) => handleFileUpload(e, 'XLS')} />

      {/* --- TOOLBAR --- */}
      <div className="bg-neutral-100 border-b border-neutral-300 p-1 flex items-center gap-1 shadow-sm shrink-0 h-10 z-[100]">
          <div className="flex items-center px-2 mr-1 border-r border-neutral-300 gap-1.5">
             <span className="text-xs font-black text-neutral-700 hidden sm:block">topoma</span>
          </div>

          <button onClick={() => setToolboxOpen(!toolboxOpen)} className={`h-8 px-3 flex items-center gap-2 rounded border mr-2 transition-all ${toolboxOpen ? 'bg-neutral-300 border-neutral-400 text-neutral-800' : 'bg-white hover:bg-neutral-200 border-neutral-300 text-neutral-600'}`}>
              <i className="fas fa-file-image text-green-700"></i> <span className="text-xs font-bold hidden md:inline">Exporter GeoTIFF</span>
          </button>

          <div className="flex items-center px-2 border-r border-neutral-300 gap-1">
              <button onClick={resetAll} className="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 border border-transparent hover:border-neutral-300"><i className="fas fa-eraser text-red-600"></i></button>
               <div className="relative group">
                   <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-neutral-200 border border-transparent hover:border-neutral-300 bg-yellow-50">
                      <i className="fas fa-plus text-black font-bold text-xs absolute top-1.5 left-2"></i>
                      <i className="fas fa-layer-group text-yellow-600"></i>
                   </button>
                   <div className="absolute top-full left-0 mt-1 bg-white border border-neutral-400 shadow-lg rounded-none w-48 hidden group-hover:block z-[110]">
                       <button onClick={() => handleFileClick(kmlInputRef)} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-100 flex items-center gap-2"><i className="fas fa-globe text-blue-500"></i> Ajouter KML/KMZ</button>
                       <button onClick={() => handleFileClick(shpInputRef)} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-100 flex items-center gap-2"><i className="fas fa-shapes text-green-500"></i> Ajouter Shapefile (ZIP)</button>
                       <button onClick={() => handleFileClick(dxfInputRef)} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-100 flex items-center gap-2"><i className="fas fa-pencil-ruler text-purple-500"></i> Ajouter DXF</button>
                       <button onClick={() => handleFileClick(geojsonInputRef)} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-100 flex items-center gap-2"><i className="fas fa-file-code text-teal-500"></i> Ajouter GeoJSON</button>
                   </div>
               </div>
          </div>

          <div className="flex items-center px-2 border-r border-neutral-300 gap-1">
              <button onClick={() => toggleTool('Pan')} className={`w-8 h-8 flex items-center justify-center rounded border ${!activeTool || activeTool === 'Pan' ? 'bg-neutral-300 border-neutral-400' : 'hover:bg-neutral-200 border-transparent'}`}><i className="fas fa-hand-paper text-neutral-700"></i></button>
               <div className="h-6 w-px bg-neutral-300 mx-1"></div>
              <div className="relative">
                  <button onClick={() => { setShowGoToPanel(!showGoToPanel); setShowExcelPanel(false); setShowSearchPanel(false); }} className={`h-8 px-2 flex items-center justify-center rounded border transition-colors ${showGoToPanel ? 'bg-neutral-200 border-neutral-400' : 'hover:bg-neutral-200 border-transparent hover:border-neutral-300'}`}><i className="fas fa-map-marker-alt text-red-600 mr-1"></i> <span className="text-xs font-bold text-neutral-700">Go XY</span></button>
                  {showGoToPanel && (
                      <div className="fixed md:absolute inset-0 md:inset-auto md:top-full md:left-0 flex items-center justify-center md:block z-[210] p-4 md:p-0 bg-black/40 md:bg-transparent">
                          <div className="bg-white rounded-lg shadow-2xl border border-neutral-300 p-3 w-64 animate-scale-in">
                              <div className="flex justify-between items-center mb-2 border-b border-neutral-100 pb-1"><span className="text-xs font-bold text-neutral-700">Go To XY</span><CloseButton onClick={() => setShowGoToPanel(false)} /></div>
                              <div className="space-y-2">
                                  <div><label className="block text-[10px] text-neutral-500 mb-0.5">Projection</label><select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)} className="w-full text-xs border border-neutral-300 rounded p-1 bg-neutral-50 focus:outline-none focus:border-blue-400">{ZONES.map(z => <option key={z.code} value={z.code}>{z.label}</option>)}</select></div>
                                  <div className="grid grid-cols-2 gap-2"><div><label className="block text-[10px] text-neutral-500 mb-0.5">X</label><input type="text" value={manualX} onChange={(e) => setManualX(e.target.value)} className="w-full text-xs border border-neutral-300 rounded p-1" /></div><div><label className="block text-[10px] text-neutral-500 mb-0.5">Y</label><input type="text" value={manualY} onChange={(e) => setManualY(e.target.value)} className="w-full text-xs border border-neutral-300 rounded p-1" /></div></div>
                                  <button onClick={handleManualAddPoint} className="w-full bg-blue-600 text-white text-xs py-1.5 rounded hover:bg-blue-700 font-medium">Localiser</button>
                              </div>
                          </div>
                      </div>
                  )}
               </div>
              <div className="hidden md:flex items-center gap-1 ml-2 pl-2 border-l border-neutral-300 bg-yellow-50/50 rounded px-1">
                  <button onClick={() => toggleTool('MeasureLength')} className={`w-8 h-8 flex items-center justify-center rounded border ${activeTool === 'MeasureLength' ? 'bg-yellow-200 border-yellow-400' : 'hover:bg-yellow-100'}`}><i className="fas fa-ruler text-yellow-700"></i></button>
                  <button onClick={() => toggleTool('MeasureArea')} className={`w-8 h-8 flex items-center justify-center rounded border ${activeTool === 'MeasureArea' ? 'bg-yellow-200 border-yellow-400' : 'hover:bg-yellow-100'}`}><i className="fas fa-ruler-combined text-yellow-700"></i></button>
                  <select value={measureUnit} onChange={(e) => handleUnitChange(e.target.value)} className="h-6 text-xs border border-yellow-300 rounded px-1 bg-white ml-1 text-neutral-700">{(activeTool === 'MeasureArea' || (!activeTool && measureUnit.includes('sq'))) ? AREA_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>) : LENGTH_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}</select>
              </div>
          </div>

          <div className="flex items-center px-2 gap-1 ml-auto">
               <div className="relative">
                  <button onClick={() => { setShowSearchPanel(!showSearchPanel); setShowGoToPanel(false); }} className={`h-8 w-8 flex items-center justify-center rounded border ${showSearchPanel ? 'bg-blue-100 text-blue-700' : 'hover:bg-neutral-200 text-neutral-600'}`}><i className="fas fa-search"></i></button>
                  {showSearchPanel && (
                      <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-neutral-300 w-64 z-[110] overflow-hidden">
                          <div className="p-2 border-b bg-neutral-50 flex items-center gap-2"><i className="fas fa-search text-neutral-400 text-xs"></i><input autoFocus type="text" className="w-full bg-transparent text-xs outline-none" placeholder="Rechercher..." value={searchQuery} onChange={handleSearchInput}/></div>
                          {searchResults.length > 0 ? (<ul className="max-h-60 overflow-y-auto">{searchResults.map((result) => (<li key={result.place_id}><button onClick={() => handleSelectSearchResult(result)} className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b last:border-0 flex flex-col gap-0.5"><span className="font-bold text-neutral-700 truncate">{result.display_name.split(',')[0]}</span><span className="text-[10px] text-neutral-500 truncate">{result.display_name}</span></button></li>))}</ul>) : (searchQuery.length > 2 && <div className="p-3 text-center text-xs text-neutral-400 italic">Aucun résultat.</div>)}
                      </div>
                  )}
               </div>
               <button onClick={() => setTocOpen(!tocOpen)} className={`flex h-8 px-3 items-center gap-2 rounded border ml-1 transition-all ${tocOpen ? 'bg-blue-600 text-white border-blue-700' : 'bg-white hover:bg-neutral-200 text-blue-600'}`}>
                  <i className={`fas fa-layer-group`}></i> <span className="text-xs font-bold hidden sm:inline">Couches</span>
               </button>
          </div>
      </div>

      {/* --- WORKSPACE --- */}
      <div className="flex-grow flex relative overflow-hidden bg-white">
          
          {/* LEFT: Export Tools */}
          <div className={`${toolboxOpen ? 'w-80' : 'w-0 overflow-hidden'} transition-all duration-300 bg-white border-r border-neutral-300 flex flex-col shrink-0 relative z-[20]`}>
               <div className="w-80 flex flex-col h-full">
                  <div className="bg-neutral-100 p-2 border-b font-bold text-xs text-green-800 flex justify-between items-center shrink-0">
                    <span><i className="fas fa-file-image mr-1"></i> Importer /Exporter GeoTIFF</span>
                    <CloseButton onClick={() => setToolboxOpen(false)} />
                  </div>
                  <div className="flex-grow overflow-y-auto p-3 bg-neutral-50">
                      
                      {/* LARGE IMPORT BUTTONS */}
                      <div className="grid grid-cols-4 gap-2 mb-4">
                          <button onClick={() => handleFileClick(kmlInputRef)} title="KML/KMZ" className="flex flex-col items-center justify-center p-2 bg-white border border-neutral-200 rounded shadow-sm hover:bg-blue-50 hover:border-blue-300 transition-all group">
                              <i className="fas fa-globe text-2xl text-blue-500 group-hover:scale-110 transition-transform"></i>
                              <span className="text-[9px] font-bold text-neutral-500 mt-1">KML</span>
                          </button>
                          <button onClick={() => handleFileClick(shpInputRef)} title="Shapefile" className="flex flex-col items-center justify-center p-2 bg-white border border-neutral-200 rounded shadow-sm hover:bg-green-50 hover:border-green-300 transition-all group">
                              <i className="fas fa-shapes text-2xl text-green-500 group-hover:scale-110 transition-transform"></i>
                              <span className="text-[9px] font-bold text-neutral-500 mt-1">SHP</span>
                          </button>
                          <button onClick={() => handleFileClick(geojsonInputRef)} title="GeoJSON" className="flex flex-col items-center justify-center p-2 bg-white border border-neutral-200 rounded shadow-sm hover:bg-teal-50 hover:border-teal-300 transition-all group">
                              <i className="fas fa-file-code text-2xl text-teal-500 group-hover:scale-110 transition-transform"></i>
                              <span className="text-[9px] font-bold text-neutral-500 mt-1">JSON</span>
                          </button>
                          <button onClick={() => handleFileClick(dxfInputRef)} title="DXF AutoCAD" className="flex flex-col items-center justify-center p-2 bg-white border border-neutral-200 rounded shadow-sm hover:bg-purple-50 hover:border-purple-300 transition-all group">
                              <i className="fas fa-pencil-ruler text-2xl text-purple-500 group-hover:scale-110 transition-transform"></i>
                              <span className="text-[9px] font-bold text-neutral-500 mt-1">DXF</span>
                          </button>
                      </div>

                      <div className="border bg-white mb-2 shadow-sm rounded-sm">
                          <div className="bg-neutral-200 px-2 py-1.5 text-xs font-bold border-b flex items-center gap-2">Extraction Raster</div>
                          <div className="p-3 text-xs space-y-4">
                              <div>
                                  <label className="block text-neutral-600 mb-1.5 font-medium">Source:</label>
                                  <select value={selectedLayerId} onChange={(e) => handleLayerSelect(e.target.value)} className="w-full border p-1.5 rounded bg-white text-xs">
                                      <option value="manual"> -- Tout (Manuel) -- </option>
                                      {manualFeatures.length > 0 && (<optgroup label="Dessins">{manualFeatures.map(feat => (<option key={feat.id} value={feat.id}>{feat.label}</option>))}</optgroup>)}
                                      {layers.length > 0 && (<optgroup label="Fichiers Importés">{layers.map(layer => (<option key={layer.id} value={layer.id}>{layer.type}: {layer.name}</option>))}</optgroup>)}
                                  </select>
                              </div>
                              {(step === 'SELECTED' || (step === 'IDLE' && selectedLayerId !== 'manual')) && exportData && (<div className="bg-blue-50 border-blue-200 border rounded p-2 text-[11px] space-y-1"><div className="font-bold flex items-center gap-1 border-b pb-1 mb-1">Info Élément</div>{exportData.area && (<div className="flex justify-between"><span>Area:</span><span className="font-bold">{exportData.area}</span></div>)}{exportData.perimeter && (<div className="flex justify-between"><span>Perim:</span><span>{exportData.perimeter}</span></div>)}</div>)}
                              <div><label className="block text-neutral-600 mb-1.5 font-medium">Échelle:</label><select value={selectedScale} onChange={(e) => handleScaleChange(Number(e.target.value))} className="w-full border p-1.5 rounded bg-white">{EXPORT_SCALES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                              <div className="border border-neutral-200 p-3 bg-neutral-50 min-h-[160px] flex flex-col items-center justify-center text-center rounded">
                                  {step === 'IDLE' && <span className="text-neutral-400 italic">Sélectionnez une zone...</span>}
                                  {(step === 'SELECTED' || (selectedLayerId !== 'manual' && exportData) || (selectedLayerId === 'manual' && manualFeatures.length > 0)) && (<button onClick={() => startClipping()} className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 transition-colors">GÉNÉRER</button>)}
                                  {step === 'PROCESSING' && (<div className="flex flex-col items-center"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mb-2"></div><span className="text-blue-700 font-bold text-xs">Traitement... {countdown}%</span></div>)}
                                  {step === 'DONE' && exportResult && (<div className="flex flex-col items-center w-full animate-scale-in"><div className="text-green-600 font-bold mb-2">Terminé !</div><div className="w-full bg-white border rounded mb-3 text-[10px] text-left overflow-hidden"><div className="grid grid-cols-[60px_1fr] border-b"><div className="bg-neutral-100 p-1 font-bold">Nom</div><div className="p-1 truncate">{exportResult.name}</div></div><div className="grid grid-cols-[60px_1fr] border-b"><div className="bg-neutral-100 p-1 font-bold">Taille</div><div className="p-1 font-bold text-blue-600">{exportResult.size}</div></div></div><button onClick={downloadFile} className="bg-green-600 text-white px-4 py-2 rounded font-bold w-full hover:bg-green-700">Télécharger ZIP</button></div>)}
                              </div>
                          </div>
                      </div>
                      <DeveloperFooter />
                  </div>
               </div>
          </div>

          {/* CENTER: MAP */}
          <div className="flex-grow relative bg-white z-[10]">
              {/* Drawing Tools Container (Top) */}
              <div className={`absolute top-2 transition-all duration-300 z-[70] flex flex-col items-end pointer-events-none gap-2 ${tocOpen ? 'right-[calc(20rem+0.5rem)]' : 'right-2'}`}>
                  
                  {/* Unified Basemap Selector */}
                  <div className="relative pointer-events-auto">
                    <button 
                        onClick={() => setBasemapPanelOpen(!basemapPanelOpen)} 
                        title="Changer de fond de plan"
                        className={`w-10 h-10 rounded-lg shadow-md border flex items-center justify-center transition-all hover:scale-105 ${basemapPanelOpen ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-blue-600'}`}
                    >
                        <i className={`fas fa-globe-africa text-lg`}></i>
                    </button>
                    
                    {basemapPanelOpen && (
                        <div className="absolute top-0 right-12 bg-white rounded-lg shadow-2xl border border-neutral-200 w-64 z-[110] overflow-hidden animate-scale-in origin-right">
                            <div className="bg-neutral-100 p-2 border-b flex justify-between items-center">
                                <span className="text-[11px] font-bold text-neutral-700">Sélectionner le fond de plan</span>
                                <CloseButton onClick={() => setBasemapPanelOpen(false)} />
                            </div>
                            <div className="max-h-[400px] overflow-y-auto p-1">
                                {BASEMAPS.map((bm) => (
                                    <label key={bm.id} className="flex items-center gap-3 px-3 py-2 hover:bg-blue-50 cursor-pointer group transition-colors">
                                        <input 
                                            type="radio" 
                                            name="basemap" 
                                            checked={basemapId === bm.id} 
                                            onChange={() => { setBasemapId(bm.id); setBasemapPanelOpen(false); }}
                                            className="w-4 h-4 text-blue-600 border-neutral-300 focus:ring-blue-500"
                                        />
                                        <span className="text-[13px] text-neutral-600 group-hover:text-neutral-800 flex items-center gap-2">
                                            <span className="text-base">{bm.icon}</span>
                                            {bm.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                  </div>
                  
                  <div className="h-1"></div>

                  <div className="relative pointer-events-auto">
                      <button onClick={() => { setShowExcelPanel(!showExcelPanel); setShowGoToPanel(false); }} className="w-10 h-10 bg-white rounded-lg shadow-md border hover:bg-neutral-50 flex items-center justify-center text-green-600 transition-transform hover:scale-105"><i className="fas fa-file-excel text-lg"></i></button>
                      {showExcelPanel && (
                          <div className="mt-2 bg-white rounded-lg shadow-xl border p-3 w-64 absolute top-full right-0 z-[110] animate-scale-in origin-top-right">
                              <div className="flex justify-between items-center mb-2 border-b pb-1">
                                  <span className="text-xs font-bold flex items-center gap-1.5">
                                      Import Excel XY
                                      <button onClick={() => setShowExcelHelp(true)} className="text-blue-500 hover:text-blue-700 text-sm">
                                          <i className="fas fa-info-circle"></i>
                                      </button>
                                  </span>
                                  <CloseButton onClick={() => setShowExcelPanel(false)} />
                              </div>
                              <div className="space-y-3">
                                  <div><label className="block text-[10px] mb-0.5 text-neutral-500">Projection (Zone)</label><select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)} className="w-full text-xs border rounded p-1 bg-neutral-50">{ZONES.map(z => <option key={z.code} value={z.code}>{z.label}</option>)}</select></div>
                                  <div className="border border-dashed border-neutral-300 rounded-lg p-3 text-center bg-neutral-50">
                                      <i className="fas fa-folder-open text-blue-500 mb-1"></i>
                                      <button onClick={() => handleFileClick(excelInputRef)} className="block w-full text-xs text-blue-600 font-bold hover:underline mb-1">Choisir un fichier</button>
                                      <div className="text-[10px] text-neutral-400 truncate">{selectedExcelFile ? selectedExcelFile.name : "Aucun fichier sélectionné"}</div>
                                  </div>
                                  <button onClick={processExcelFile} disabled={!selectedExcelFile} className={`w-full text-white text-xs py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${selectedExcelFile ? 'bg-green-600 hover:bg-green-700 shadow-md' : 'bg-neutral-300 cursor-not-allowed'}`}><i className="fas fa-upload text-[10px]"></i> Charger les points</button>
                              </div>
                          </div>
                      )}
                  </div>
                  
                  {/* DRAWING TOOLS (Ordered as requested: Point, Line, Polygon, Rectangle, Edit, Undo) */}
                  <button onClick={() => toggleTool('Point')} className={`pointer-events-auto w-9 h-9 rounded shadow-md border flex items-center justify-center transition-all ${activeTool === 'Point' ? 'bg-blue-600 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`} title="Dessiner un Point"><i className="fas fa-map-marker-alt text-base"></i></button>
                  <button onClick={() => toggleTool('Line')} className={`pointer-events-auto w-9 h-9 rounded shadow-md border flex items-center justify-center transition-all ${activeTool === 'Line' ? 'bg-blue-600 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`} title="Dessiner une Ligne"><i className="fas fa-slash text-base"></i></button>
                  <button onClick={() => toggleTool('Polygon')} className={`pointer-events-auto w-9 h-9 rounded shadow-md border flex items-center justify-center transition-all ${activeTool === 'Polygon' ? 'bg-blue-600 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`} title="Dessiner un Mضلع"><i className="fas fa-draw-polygon text-base"></i></button>
                  <button onClick={() => toggleTool('Rectangle')} className={`pointer-events-auto w-9 h-9 rounded shadow-md border flex items-center justify-center transition-all ${activeTool === 'Rectangle' ? 'bg-blue-600 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`} title="Dessiner un Rectangle"><i className="far fa-square text-base"></i></button>
                  <button onClick={() => toggleTool('Edit')} className={`pointer-events-auto w-9 h-9 rounded shadow-md border flex items-center justify-center transition-all ${activeTool === 'Edit' ? 'bg-orange-500 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`} title="Modifier"><i className="fas fa-pen-to-square text-base"></i></button>
                  <button onClick={() => mapComponentRef.current?.undo()} className="pointer-events-auto w-9 h-9 rounded shadow-md border flex items-center justify-center bg-white text-neutral-700 hover:bg-neutral-50 transition-all active:scale-90" title="Tراجع"><i className="fas fa-rotate-left text-base"></i></button>
              </div>

              {/* My Location Button (Bottom-Right - Raised higher) */}
              <div className={`absolute bottom-20 transition-all duration-300 z-[70] pointer-events-none ${tocOpen ? 'right-[calc(20rem+1rem)]' : 'right-4'}`}>
                  <button 
                    onClick={() => mapComponentRef.current?.locateUser()}
                    title="Ma position"
                    className="pointer-events-auto w-10 h-10 rounded-full shadow-lg border border-neutral-200 bg-white hover:bg-neutral-100 flex items-center justify-center text-blue-600 transition-all hover:scale-110 active:scale-95"
                  >
                      <i className="fas fa-location-crosshairs text-lg"></i>
                  </button>
              </div>

              <MapComponent 
                ref={mapComponentRef} 
                basemapId={basemapId}
                selectedZone={selectedZone}
                onMouseMove={(x, y) => setMouseCoords({x, y})}
                onManualFeaturesChange={(features) => setManualFeatures(features)}
                onSelectionComplete={(data) => {
                  setExportData({ ...data, projection: selectedZone }); 
                  setStep('SELECTED');
                  if (activeTool !== 'Edit' && activeTool !== 'Delete') setToolboxOpen(true);
                  if (data.featureId) {
                      setSelectedLayerId(data.featureId);
                      setSelectedAttrFeatureId(data.featureId);
                  }
                }} 
              />

              {/* EXCEL IMPORT HELP MODAL */}
              {showExcelHelp && (
                  <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowExcelHelp(false)}>
                      <div className="bg-white p-2 rounded-xl shadow-2xl max-w-2xl w-full relative animate-scale-in" onClick={e => e.stopPropagation()}>
                          <div className="absolute top-[-10px] right-[-10px]"><CloseButton onClick={() => setShowExcelHelp(false)} /></div>
                          <div className="bg-neutral-100 px-4 py-2 rounded-t-lg border-b font-bold text-neutral-700 text-sm mb-2 flex items-center gap-2">
                              <i className="fas fa-info-circle text-blue-500"></i> Format de fichier requis (Exemple)
                          </div>
                          <img 
                              src="https://ia902900.us.archive.org/14/items/capture-decran-2026-02-01-200134/Capture%20d%27%C3%A9cran%202026-02-01%20200134.png" 
                              alt="Format Excel Help" 
                              className="w-full h-auto rounded border shadow-inner" 
                          />
                          <div className="mt-3 p-3 bg-blue-50 rounded-lg text-[11px] text-blue-800 italic">
                              * Assurez-vous que vos colonnes sont nommées 'X' et 'Y' (ou 'Easting'/'Northing').
                          </div>
                      </div>
                  </div>
              )}

              {/* ATTRIBUTE TABLE OVERLAY */}
              {showAttrTable && (
                  <div className={`absolute bottom-0 left-0 ${tocOpen ? 'right-80' : 'right-0'} bg-white border-t-2 border-blue-500 h-1/3 z-[80] flex flex-col shadow-2xl animate-slide-up transition-all duration-300`}>
                      <div className="bg-neutral-100 p-2 flex justify-between items-center border-b">
                          <span className="text-xs font-bold text-neutral-700 flex items-center gap-2">
                              <i className="fas fa-table text-blue-600"></i> Table d'attributs: {attrTableTitle}
                          </span>
                          <CloseButton onClick={() => setShowAttrTable(false)} />
                      </div>
                      <div className="flex-grow overflow-auto">
                          {attrTableData.length > 0 ? (
                              <table className="w-full text-[11px] text-left">
                                  <thead className="bg-neutral-50 sticky top-0 shadow-sm">
                                      <tr>
                                          {Object.keys(attrTableData[0]).filter(k => k !== '_featureId').map(key => (
                                              <th key={key} className="px-3 py-2 border-b border-r bg-neutral-100 font-bold uppercase text-[9px] text-neutral-500">{key}</th>
                                          ))}
                                      </tr>
                                  </thead>
                                  <tbody>
                                      {attrTableData.map((row, idx) => (
                                          <tr 
                                            key={idx} 
                                            onClick={() => handleRowClick(row)}
                                            className={`cursor-pointer transition-colors ${selectedAttrFeatureId === row._featureId ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-blue-50 odd:bg-white even:bg-neutral-50/50'}`}
                                          >
                                              {Object.entries(row).filter(([k]) => k !== '_featureId').map(([key, vIdx], idx2) => (
                                                  <td key={idx2} className="px-3 py-1.5 border-b border-r truncate max-w-[200px]" title={String(vIdx)}>{String(vIdx)}</td>
                                              ))}
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          ) : (
                              <div className="p-8 text-center text-neutral-400 italic text-xs">Aucune donnée disponible.</div>
                          )}
                      </div>
                  </div>
              )}

              {/* LABEL PICKER MODAL */}
              {labelPicker && (
                  <div className="absolute inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
                      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
                          <div className="bg-neutral-100 p-3 border-b flex justify-between items-center">
                              <span className="text-sm font-bold">Sélectionner le champ d'étiquette</span>
                              <CloseButton onClick={() => setLabelPicker(null)} />
                          </div>
                          <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                              <button 
                                onClick={() => selectLabelField("")}
                                className="w-full text-left px-3 py-2 text-xs border rounded hover:bg-neutral-100 font-bold text-red-600"
                              >
                                -- Aucune étiquette --
                              </button>
                              {labelPicker.fields.map(field => (
                                  <button 
                                    key={field} 
                                    onClick={() => selectLabelField(field)}
                                    className="w-full text-left px-3 py-2 text-xs border rounded hover:bg-blue-50 transition-colors"
                                  >
                                      {field}
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>
              )}
          </div>

          {/* RIGHT: TOC (Couches - Sidebar Panel) */}
          <div className={`${tocOpen ? 'w-80 border-l' : 'w-0 overflow-hidden'} transition-all duration-300 bg-white border-neutral-300 flex flex-col absolute right-0 top-0 h-full z-[90] shadow-2xl shrink-0`}>
              <div className="w-80 flex flex-col h-full">
                <div className="bg-neutral-100 p-2.5 border-b font-bold text-xs text-neutral-700 flex justify-between items-center shrink-0">
                    <span className="flex items-center gap-2"><i className="fas fa-layer-group text-blue-600"></i> Couches de données</span>
                    <div className="flex gap-3 items-center">
                        <CloseButton onClick={() => setTocOpen(false)} />
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto p-4 space-y-6 bg-neutral-50/30">
                    <div>
                      <div className="flex items-center gap-2 mb-3 font-bold text-xs text-neutral-800 uppercase tracking-wider border-b pb-1"><i className="fas fa-draw-polygon text-blue-500"></i> Dessins Manuels</div>
                      <div className="space-y-1">
                          <div className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors shadow-sm ${selectedLayerId === 'manual' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600'}`} onClick={() => handleLayerSelect('manual')}>
                              <span className="text-xs font-bold truncate">Tous les éléments</span>
                              <button onClick={(e) => { e.stopPropagation(); openAttributeTable('manual'); }} title="Table d'attributs" className="text-blue-500 hover:scale-110 p-1"><i className="fas fa-table"></i></button>
                          </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3 font-bold text-xs text-neutral-800 uppercase tracking-wider border-b pb-1"><i className="fas fa-file-import text-yellow-600"></i> Fichiers Importés</div>
                      <div className="space-y-1">
                          {layers.length > 0 ? layers.map((layer) => (
                              <div key={layer.id} className={`flex items-center justify-between p-2 rounded cursor-pointer group transition-colors shadow-sm ${selectedLayerId === layer.id ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600'}`} onClick={() => handleLayerSelect(layer.id)}>
                                  <span className="text-xs font-medium truncate flex-grow" title={layer.name}>
                                      {layer.name}
                                  </span>
                                  <div className="flex gap-2 shrink-0 ml-2">
                                      <button onClick={(e) => { e.stopPropagation(); openLabelPicker(layer); }} title="Étiquettes" className="text-orange-500 hover:text-orange-700 transition-transform hover:scale-110"><i className="fas fa-tag"></i></button>
                                      <button onClick={(e) => { e.stopPropagation(); openAttributeTable(layer); }} title="Données" className="text-blue-500 hover:text-blue-700 transition-transform hover:scale-110"><i className="fas fa-table"></i></button>
                                  </div>
                              </div>
                          )) : (
                              <div className="text-[11px] text-neutral-400 italic py-6 text-center border border-dashed rounded bg-neutral-100">Aucun fichier chargé</div>
                          )}
                      </div>
                    </div>
                    
                    <DeveloperFooter />
                </div>
              </div>
          </div>
      </div>

      {/* STATUS BAR */}
      <div className="bg-neutral-200 border-t border-neutral-300 h-6 flex items-center px-2 text-[10px] text-neutral-600 justify-between shrink-0 z-[100]">
          <div className="flex gap-6 items-center">
              <div className="flex gap-3 font-mono text-neutral-700"><span className="w-20 text-right">{mouseCoords.y}</span><span className="w-20 text-left">{mouseCoords.x}</span></div>
              <div className="flex items-center gap-1 border-l border-neutral-300 pl-4"><span>Scale:</span><select value={selectedScale} onChange={(e) => handleScaleChange(Number(e.target.value))} className="bg-neutral-200 border-none focus:ring-0 p-0 text-[10px] h-4">{MAP_SCALES.map(s => <option key={s.value} value={s.value}>1:{s.value}</option>)}</select></div>
          </div>
          <div className="flex items-center gap-1"><span>Prj:</span><select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)} className="bg-neutral-200 border-none focus:ring-0 p-0 text-[10px] h-4 font-bold">{ZONES.map(z => <option key={z.code} value={z.code}>{z.label}</option>)}</select></div>
      </div>
    </div>
  );
};

export default App;
