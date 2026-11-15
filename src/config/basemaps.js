/* Basemaps.
   Earth: Esri satellite tiles (Web Mercator).
   Moon/Mars: NASA Trek tiles. Global Trek layers are often EPSG:4326 while MapLibre
   expects Web Mercator, so check that a known crater lands under its marker. */
export const BASEMAPS = {
  earth: {
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxzoom: 17,
    bg: '#0b1d33'
  },
  moon: {
    tiles: ['https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg'],
    attribution: 'NASA Moon Trek',
    maxzoom: 8,
    bg: '#2b2b30'
  },
  mars: {
    tiles: ['https://trek.nasa.gov/tiles/Mars/EQ/Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg'],
    attribution: 'NASA Mars Trek',
    minzoom: 1,
    maxzoom: 8,
    bg: '#3a1f16'
  }
};

export const BODY_COLORS = { earth: '#56c271', moon: '#d9dde3', mars: '#ee6a3c' };
export const BODY_KEYS = ['earth', 'moon', 'mars'];
