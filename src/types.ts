export interface PropertyRow {
  rowIndex: number;
  tipo: string;
  estado: string;
  calle: string;
  poblacion: string;
  cp: string;
  m2: string;
  refCatastral: string;
  estadoPropiedad: string;
  precio: string;
}

export interface SheetConfig {
  dni: string;
  gmail: string;
}

export interface ExecuteRequest {
  config: SheetConfig;
  rows: PropertyRow[];
}

export interface IdealistaData {
  valoracionVenta: string;
  valoracionAlquiler: string;
  precioM2: string;
  raw: string;
}

export interface BbvaData {
  valoracion: string;
  valoracionMin: string;
  valoracionMax: string;
  raw: string;
}

export interface ScrapingResult {
  rowIndex: number;
  idealista: IdealistaData | null;
  bbva: BbvaData | null;
  idealistaError: string | null;
  bbvaError: string | null;
}
