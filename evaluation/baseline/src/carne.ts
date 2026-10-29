// Texto sintético de un carné institucional, con la forma que lee `parseQrTextData`:
// «NOMBRE DOCUMENTO PROGRAMA CIUDAD Válido hasta DD de MES de AAAA». Las identidades son
// inventadas: nombres de una lista fija y documentos aleatorios, nunca datos reales.

const NOMBRES = ['ANA', 'LUIS', 'MARTA', 'JORGE', 'SOFIA', 'ANDRES', 'LAURA', 'CAMILO', 'PAULA', 'DIEGO'];
const APELLIDOS = ['PRUEBA', 'SINTETICO', 'FICTICIO', 'EJEMPLO', 'MODELO', 'MUESTRA', 'ENSAYO', 'SIMULADO'];
const PROGRAMAS = [
  'Ingeniería de Sistemas',
  'Administración de Empresas',
  'Psicología',
  'Licenciatura en Matemáticas',
  'Zootecnia',
];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Generador pseudoaleatorio con semilla (mulberry32), solo para que una corrida sea
 * repetible. No es criptográfico ni se usa para nada de seguridad: elige datos de prueba.
 */
export function generador(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function elegir<T>(azar: () => number, lista: readonly T[]): T {
  return lista[Math.floor(azar() * lista.length)];
}

export interface Carne {
  nombre: string;
  documento: string;
  programa: string;
  vigencia: { dia: number; mes: number; anio: number };
}

export function carneSintetico(azar: () => number, anioVigencia: number): Carne {
  const digitos = 8 + Math.floor(azar() * 3); // 8 a 10 dígitos
  let documento = String(1 + Math.floor(azar() * 9));
  while (documento.length < digitos) documento += String(Math.floor(azar() * 10));
  return {
    nombre: `${elegir(azar, NOMBRES)} ${elegir(azar, APELLIDOS)} ${elegir(azar, APELLIDOS)}`,
    documento,
    programa: elegir(azar, PROGRAMAS),
    vigencia: { dia: 1 + Math.floor(azar() * 28), mes: Math.floor(azar() * 12), anio: anioVigencia },
  };
}

export function textoCarne(carne: Carne): string {
  const { dia, mes, anio } = carne.vigencia;
  const fecha = `${String(dia).padStart(2, '0')} de ${MESES[mes]} de ${anio}`;
  return `${carne.nombre} ${carne.documento} ${carne.programa} Pitalito Válido hasta ${fecha}`;
}
