import * as chrono from 'chrono-node';
import type { ParsedResult } from 'chrono-node';

// Configuración de fechas permitidas
const MAX_DIAS_ADELANTE = 30;

export interface ParsedDate {
  fecha: Date;
  confianza: 'alta' | 'media' | 'baja';
  textoOriginal: string;
  esAmbiguo: boolean;
  posiblesInterpretaciones?: Date[];
}

/**
 * Parsea fechas en lenguaje natural español
 */
export const parsearFechaNatural = (texto: string, referenciaActual: Date = new Date()): ParsedDate | null => {
  // Normalizar texto
  const textoNormalizado = texto.toLowerCase().trim();

  // Configurar chrono para español
  const resultados = chrono.es.parse(textoNormalizado, referenciaActual, { forwardDate: true });

  if (resultados.length === 0) {
    return null;
  }

  // Tomar el primer resultado
  const resultado = resultados[0];
  const fechaParseada = resultado.start.date();

  // Validar que esté dentro del rango permitido
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const fechaMaxima = new Date();
  fechaMaxima.setDate(fechaMaxima.getDate() + MAX_DIAS_ADELANTE);
  fechaMaxima.setHours(23, 59, 59, 999);

  if (fechaParseada < hoy || fechaParseada > fechaMaxima) {
    return null;
  }

  // Determinar nivel de confianza y ambigüedad
  const confianza = determinarConfianza(textoNormalizado, resultado);
  const esAmbiguo = detectarAmbiguedad(textoNormalizado);

  return {
    fecha: fechaParseada,
    confianza,
    textoOriginal: texto,
    esAmbiguo,
    posiblesInterpretaciones: esAmbiguo ? obtenerPosiblesFechas(textoNormalizado, referenciaActual) : undefined
  };
};

/**
 * Determina el nivel de confianza del parsing
 */
const determinarConfianza = (texto: string, resultado: ParsedResult): 'alta' | 'media' | 'baja' => {
  // Fechas específicas = alta confianza
  if (/\d{1,2}[\/\-]\d{1,2}/.test(texto)) {
    return 'alta';
  }

  // Palabras clave claras
  if (/mañana|hoy|pasado mañana/.test(texto)) {
    return 'alta';
  }

  // Referencias a días de la semana con "próximo" o "siguiente"
  if (/próximo|siguiente|este/.test(texto) && /(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/.test(texto)) {
    return 'media';
  }

  // Solo día de la semana (puede ser ambiguo)
  if (/(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/.test(texto) && !/próximo|siguiente|este/.test(texto)) {
    return 'baja';
  }

  return 'media';
};

/**
 * Detecta si la expresión es ambigua
 */
const detectarAmbiguedad = (texto: string): boolean => {
  // Solo día de semana sin especificar cuál (podría ser esta semana o la próxima)
  if (/(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/.test(texto) &&
    !/próximo|siguiente|este|esta/.test(texto)) {
    return true;
  }

  // Referencias vagas como "esta semana", "pronto", "cuando puedas"
  if (/esta semana|pronto|cuando|algún día/.test(texto)) {
    return true;
  }

  return false;
};

/**
 * Obtiene múltiples interpretaciones posibles de una fecha ambigua
 */
const obtenerPosiblesFechas = (texto: string, referencia: Date): Date[] => {
  const fechas: Date[] = [];

  // Parsear para esta semana y próxima semana
  const resultadoCercano = chrono.es.parse(texto, referencia, { forwardDate: true });
  if (resultadoCercano.length > 0) {
    fechas.push(resultadoCercano[0].start.date());
  }

  // Si es día de semana, buscar la siguiente ocurrencia
  const match = texto.match(/(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/);
  if (match) {
    const diaSemana = match[1];
    const siguienteOcurrencia = obtenerSiguienteDiaSemana(diaSemana, referencia, 7); // Próxima semana
    if (siguienteOcurrencia) {
      fechas.push(siguienteOcurrencia);
    }
  }

  return fechas;
};

/**
 * Obtiene la siguiente ocurrencia de un día de la semana
 */
const obtenerSiguienteDiaSemana = (dia: string, desde: Date, diasMinimos: number = 0): Date | null => {
  const diasSemana: { [key: string]: number } = {
    'domingo': 0,
    'lunes': 1,
    'martes': 2,
    'miércoles': 3,
    'miercoles': 3,
    'jueves': 4,
    'viernes': 5,
    'sábado': 6,
    'sabado': 6
  };

  const diaObjetivo = diasSemana[dia.toLowerCase()];
  if (diaObjetivo === undefined) return null;

  const resultado = new Date(desde);
  resultado.setHours(0, 0, 0, 0);

  let diasHastaObjetivo = (diaObjetivo - resultado.getDay() + 7) % 7;

  // Si queremos el próximo (no este)
  if (diasHastaObjetivo < diasMinimos) {
    diasHastaObjetivo += 7;
  }

  resultado.setDate(resultado.getDate() + diasHastaObjetivo);
  return resultado;
};

/**
 * Formatea una fecha de forma amigable en español
 */
export const formatearFechaAmigable = (fecha: Date): string => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const mañana = new Date(hoy);
  mañana.setDate(mañana.getDate() + 1);

  const pasadoMañana = new Date(hoy);
  pasadoMañana.setDate(pasadoMañana.getDate() + 2);

  const fechaNormalizada = new Date(fecha);
  fechaNormalizada.setHours(0, 0, 0, 0);

  if (fechaNormalizada.getTime() === hoy.getTime()) {
    return 'hoy';
  }
  if (fechaNormalizada.getTime() === mañana.getTime()) {
    return 'mañana';
  }
  if (fechaNormalizada.getTime() === pasadoMañana.getTime()) {
    return 'pasado mañana';
  }

  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const diaSemana = dias[fechaNormalizada.getDay()];
  const dia = fechaNormalizada.getDate();
  const mes = meses[fechaNormalizada.getMonth()];

  return `${diaSemana} ${dia} de ${mes}`;
};

/**
 * Valida si una hora está en formato correcto
 */
export const validarHorario = (horario: string): boolean => {
  const regex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  return regex.test(horario);
};
