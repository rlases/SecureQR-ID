export interface QrParsedData {
    nombre: string;
    documento: string;
    rol: string;
    // Campos extra opcionales para preservar información antigua
    programa?: string;
    cargo?: string;
    ciudad?: string;
    vigencia?: string;
}

export interface QrParseResult {
    message: string;
    type: 'success' | 'error';
    parsedData: QrParsedData | null;
}

const VALID_UNAD_CITIES_RAW = [
    'Acacías', 'Acacias', 'Puerto Carreño', 'Puerto Carreno', 'Yopal', 'Cumaral', 'Inírida', 'Inirida', 'Leticia', 'San José del Guaviare', 'San Jose del Guaviare', 'Puerto Colombia', 'Cartagena', 'Riohacha', 'Santa Marta', 'Valledupar', 'Curumaní', 'Curumani', 'El Banco', 'Plato', 'Corozal', 'Sahagún', 'Sahagun', 'Bogotá', 'Bogota', 'Fusagasugá', 'Fusagasuga', 'Girardot', 'Arbeláez', 'Arbelaez', 'Gachetá', 'Gacheta', 'Soacha', 'Zipaquirá', 'Zipaquira', 'Facatativá', 'Facatativa', 'Tunja', 'Sogamoso', 'Duitama', 'Chiquinquirá', 'Chiquinquira', 'Garagoa', 'Soatá', 'Soata', 'Boavita', 'Cubará', 'Cubara', 'Socha', 'Bucaramanga', 'Málaga', 'Malaga', 'Vélez', 'Velez', 'Ocaña', 'Ocana', 'Barrancabermeja', 'Cúcuta', 'Cucuta', 'Pamplona', 'Palmira', 'Popayán', 'Popayan', 'Santander de Quilichao', 'Cali', 'El Bordo', 'Tumaco', 'Pasto', 'Medellín', 'Medellin', 'La Dorada', 'Turbo', 'Dosquebradas', 'Quibdó', 'Quibdo', 'Neiva', 'Pitalito', 'La Plata', 'Florencia', 'Ibagué', 'Ibague', 'Líbano', 'Libano', 'Mariquita', 'Puerto Asís', 'Puerto Asis', 'Valle del Guamuéz', 'Valle del Guamuez', 'San Vicente del Caguán', 'San Vicente del Caguan'
];

const NORMALIZED_CITY_MAP = VALID_UNAD_CITIES_RAW.reduce<Record<string, string>>((acc, city) => {
    acc[city.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s/g, '')] = city;
    return acc;
}, {});

const accentInsensitive = (s: string) =>
    s
        .replace(/a/gi, '[aáàäâ]')
        .replace(/e/gi, '[eéèëê]')
        .replace(/i/gi, '[iíìïî]')
        .replace(/o/gi, '[oóòöô]')
        .replace(/u/gi, '[uúùüû]')
        .replace(/ñ/gi, '[nñ]');

export const parseQrUrlData = (htmlText: string): QrParseResult => {
    if (typeof DOMParser === 'undefined') {
        return { message: '⚠️ No se puede parsear HTML en este entorno.', type: 'error', parsedData: null };
    }

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

        const ciudadMatch = pageText.match(/Ciudad:\s*([^\n\r]+)/i);
        if (ciudadMatch) {
            ciudad = ciudadMatch[1].trim();
        }

        const vigMatch = pageText.match(/Vigencia:\s*([^\n\r]+)/i);
        if (vigMatch) {
            vigencia = vigMatch[1].trim();
        }

        const cargoMatch = pageText.match(/Cargo:\s*([^\n\r]+)/i);
        if (cargoMatch && cargoMatch[1]) {
            cargo = cargoMatch[1].trim();
            rol = cargo; // Respetamos texto libre (ADR-0009)
            programa = cargo;
        }

        const documentoNum = parseInt(documentoStr, 10);
        if (!/^\d{6,12}$/.test(documentoStr) || Number.isNaN(documentoNum)) {
            return { message: '❌ Documento inválido en el QR.', type: 'error', parsedData: null };
        }

        if (nombre && documentoStr && cargo !== 'N/A') {
            return {
                message: '',
                type: 'success',
                parsedData: {
                    nombre,
                    documento: documentoStr,
                    rol,
                    programa,
                    cargo,
                    ciudad,
                    vigencia
                }
            };
        } else {
            return {
                message: '❌ URL válida, pero no se pudieron extraer todos los datos (Nombre, Documento o Cargo).',
                type: 'error',
                parsedData: null
            };
        }

    } catch (error: any) {
        return {
            message: `⚠️ Error al procesar el contenido HTML: ${error.message}.`,
            type: 'error',
            parsedData: null
        };
    }
};

export const parseQrTextData = (datosQr: string): QrParseResult => {
    const match = datosQr.match(/(.+?)(\d{6,12})([\s\S]+?)((?:V[áa]lido)\s+hasta\s+\d{2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóú]+\s+de\s+\d{4})/i);

    if (!match) {
        return {
            message: '❌ Código QR inválido. Formato de texto no reconocido o URL inválida.',
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

    for (const [, originalCity] of Object.entries(NORMALIZED_CITY_MAP)) {
        const cityPattern = new RegExp(`^(.*?)(?:\\s*)(${accentInsensitive(originalCity)})\\s*$`, 'i');
        const m = programaCiudadRaw.match(cityPattern);
        if (m) {
            programa = m[1].trim();
            ciudad = originalCity;
            break;
        }
    }

    // Texto libre ADR-0009
    rol = programa;

    const documentoNum = parseInt(documentoStr, 10);
    if (!/^\d{6,12}$/.test(documentoStr) || Number.isNaN(documentoNum)) {
        return { message: '❌ Documento inválido en el QR.', type: 'error', parsedData: null };
    }

    return {
        message: '',
        type: 'success',
        parsedData: {
            nombre,
            documento: documentoStr,
            rol,
            programa,
            cargo: 'N/A',
            ciudad,
            vigencia
        }
    };
};
