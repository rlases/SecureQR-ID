// src/utils/qrParser.js

import { VALID_UNAD_CITIES_NORMALIZED_SORTED, NORMALIZED_CITY_MAP } from '../constants/unadCities.js';
import { ROLES, ROLE_NAMES } from '../constants/appConstants.js';

/**
 * Normaliza una cadena de texto eliminando acentos y convirtiéndola a minúsculas,
 * con una protección para valores nulos o indefinidos.
 * @param {string | null | undefined} s - La cadena a normalizar.
 * @returns {string} La cadena normalizada.
 */
const norm = s => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Aux: crea un patrón acento-insensible para una ciudad
const accentInsensitive = (s) =>
    s
        .replace(/a/gi, '[aáàäâ]')
        .replace(/e/gi, '[eéèëê]')
        .replace(/i/gi, '[iíìïî]')
        .replace(/o/gi, '[oóòöô]')
        .replace(/u/gi, '[uúùüû]')
        .replace(/ñ/gi, '[nñ]');

/**
 * Procesa el contenido HTML de un carnet para extraer información.
 * @param {string} htmlText - El contenido HTML de la página del carnet.
 * @returns {object} Un objeto con { message, type, parsedData }.
 */
export const parseQrUrlData = (htmlText) => {
    // Fallback si no hay DOMParser (ej. en entorno Node.js)
    if (typeof DOMParser === 'undefined') {
        return { message: '⚠️ No se puede parsear HTML en este entorno.', type: 'error', parsedData: null };
    }

    const now = new Date();
    const formattedNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    let nombre = '';
    let documentoStr = '';
    let programa = 'N/A';
    let ciudad = 'N/A';
    let vigencia = 'N/A';
    let rol = 'Desconocido';
    let cargo = 'N/A';

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const pageText = doc.body.textContent || '';

        // Regex más flexible para nombres y cédulas, incluyendo variantes con y sin acento
        const fullDataMatch = pageText.match(/(?:Resultado de Validaci[oó]n\s*|Nombre:\s*)([A-ZÁÉÍÓÚÑ\s]+)\s*C[eé]dula de Ciudadan[ií]a:\s*(\d+)/i);
        if (fullDataMatch) {
            nombre = fullDataMatch[1].trim();
            documentoStr = fullDataMatch[2].trim();
        } else {
            const nameMatch = pageText.match(/(?:Resultado de Validaci[oó]n\s*|Nombre:\s*)([A-ZÁÉÍÓÚÑ\s]+)/i);
            if (nameMatch && nameMatch[1]) {
                nombre = nameMatch[1].trim();
            }
            const cedulaMatch = pageText.match(/(?:C[eé]dula de Ciudadan[ií]a|Documento):\s*(\d+)/i);
            if (cedulaMatch && cedulaMatch[1]) {
                documentoStr = cedulaMatch[1].trim();
            }
        }

        // Extraer ciudad y vigencia del HTML
        const ciudadMatch = pageText.match(/Ciudad:\s*([^\n\r]+)/i);
        if (ciudadMatch) {
            ciudad = ciudadMatch[1].trim();
        }

        const vigMatch = pageText.match(/Vigencia:\s*([^\n\r]+)/i);
        if (vigMatch) {
            vigencia = vigMatch[1].trim();
        }

        // Regex para el cargo que también maneja CRLF/múltiples espacios
        const cargoMatch = pageText.match(/Cargo:\s*([^\n\r]+)/i);
        if (cargoMatch && cargoMatch[1]) {
            cargo = cargoMatch[1].trim();
            const lowerCaseCargo = norm(cargo);

            if (lowerCaseCargo.includes('monitor')) {
                rol = ROLE_NAMES[ROLES.MONITOR];
            } else if (lowerCaseCargo.includes('estudiante')) {
                rol = ROLE_NAMES[ROLES.ESTUDIANTE];
            } else if (lowerCaseCargo.includes('docente') || lowerCaseCargo.includes('profesor') || lowerCaseCargo.includes('contratista')) {
                rol = ROLE_NAMES[ROLES.DOCENTE];
            } else if (lowerCaseCargo.includes('administrativo') || lowerCaseCargo.includes('gestion') || lowerCaseCargo.includes('secretaria') || lowerCaseCargo.includes('coordinador')) {
                rol = ROLE_NAMES[ROLES.ADMINISTRATIVO];
            } else {
                rol = cargo.charAt(0).toUpperCase() + cargo.slice(1).toLowerCase();
            }
            programa = cargo;
        }

        // Validación más estricta del documento
        const documentoNum = parseInt(documentoStr, 10);
        if (!/^\d{6,12}$/.test(documentoStr) || Number.isNaN(documentoNum)) {
            return { message: '❌ Documento inválido en el QR.', type: 'error', parsedData: null };
        }

        if (nombre && documentoStr && cargo !== 'N/A') {
            return {
                message: '',
                type: 'success',
                parsedData: {
                    Nombre: nombre,
                    Documento: documentoNum,
                    Programa: programa,
                    Cargo: cargo,
                    Entrada: formattedNow,
                    Salida: null,
                    Ciudad: ciudad,
                    Vigencia: vigencia,
                    Rol: rol
                }
            };
        } else {
            return {
                message: '❌ URL válida, pero no se pudieron extraer todos los datos (Nombre, Documento o Cargo).',
                type: 'error',
                parsedData: null
            };
        }

    } catch (error) {
        console.error("Error al analizar el contenido de la URL:", error);
        return {
            message: `⚠️ Error al procesar el contenido HTML: ${error.message}.`,
            type: 'error',
            parsedData: null
        };
    }
};

/**
 * Procesa la cadena de datos de un código QR que contiene texto directo.
 * @param {string} datosQr - La cadena de texto del código QR.
 * @returns {object} Un objeto con { message, type, extra, parsedData }.
 */
export const parseQrTextData = (datosQr) => {
    const now = new Date();
    const formattedNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    // Expresión regular mejorada para ser más flexible.
    const match = datosQr.match(/(.+?)(\d{6,12})([\s\S]+?)((?:V[áa]lido)\s+hasta\s+\d{2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóú]+\s+de\s+\d{4})/i);

    if (!match) {
        return {
            message: "❌ Código QR inválido. Formato de texto no reconocido (esperado: Nombre<6-12 dígitos>ProgramaCiudadValido hasta DD de Mes de AAAA) o URL inválida.",
            type: 'error',
            parsedData: null
        };
    }

    const nombre = match[1].trim();
    const documentoStr = match[2].trim();
    const programaCiudadRaw = match[3].trim();
    const vigencia = match[4].trim();

    let programa = programaCiudadRaw;
    let ciudad = 'N/A';
    let rol = 'Desconocido';

    // Nuevo bloque para separar la ciudad al final de la cadena, incluso si está pegada
    for (const [normalizedKey, originalCity] of Object.entries(NORMALIZED_CITY_MAP)) {
        const cityPattern = new RegExp(`^(.*?)(?:\\s*)(${accentInsensitive(originalCity)})\\s*$`, 'i');
        const m = programaCiudadRaw.match(cityPattern);
        if (m) {
            programa = m[1].trim();
            ciudad = originalCity;
            break;
        }
    }

    // Detección de rol (igual que antes)
    if (norm(programa).includes('estudiante')) {
        rol = ROLE_NAMES[ROLES.ESTUDIANTE];
    } else {
        rol = ROLE_NAMES[ROLES.MONITOR];
    }

    const documentoNum = parseInt(documentoStr, 10);
    // Validación de documento
    if (!/^\d{6,12}$/.test(documentoStr) || Number.isNaN(documentoNum)) {
        return { message: '❌ Documento inválido en el QR.', type: 'error', parsedData: null };
    }

    return {
        message: '',
        type: 'success',
        parsedData: {
            Nombre: nombre,
            Documento: documentoNum,
            Programa: programa,
            Cargo: 'N/A',
            Entrada: formattedNow,
            Salida: null,
            Ciudad: ciudad,
            Vigencia: vigencia,
            Rol: rol
        }
    };
};

/**
 * Función para simular el parseo de un QR real.
 * @param {string} qrInput El valor de entrada del escáner QR.
 * @returns {Promise<object>} Una promesa que se resuelve con los datos del usuario.
 */
export const getFakeQrData = async (qrInput) => {
    // Simulación de validación y retraso de red
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const data = {
                "1000196236": {
                    Nombre: "Jhunier Libardo Hernandez Calderon",
                    Documento: 1000196236, // Corregido a número
                    Correo: "jlhernandezca@unadvirtual.edu.co",
                    Rol: "Estudiante",
                    Programa: "Ingeniería de Sistemas",
                    Ciudad: "Pitalito",
                },
                "1082534575": {
                    Nombre: "Andrea Camila Martinez",
                    Documento: 1082534575, // Corregido a número
                    Correo: "acmartinez@unadvirtual.edu.co",
                    Rol: "Docente",
                    Programa: "Ingeniería Industrial",
                    Ciudad: "Neiva",
                },
                "9876543210": {
                    Nombre: "Carlos Mario Perez",
                    Documento: 9876543210, // Corregido a número
                    Correo: "carlosperez@unadvirtual.edu.co",
                    Rol: "Administrativo",
                    Programa: "N/A",
                    Cargo: "Decano",
                    Ciudad: "Bogotá",
                },
            };

            if (data[qrInput]) {
                resolve(data[qrInput]);
            } else {
                reject({ message: "Usuario no encontrado en la base de datos." });
            }
        }, 500);
    });
};
