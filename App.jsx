import React, { useState, useEffect } from 'react';

// Lista de ciudades de las sedes UNAD (normalizadas y ordenadas por longitud descendente)
const VALID_UNAD_CITIES_RAW = [
    "Acacias", "Puerto Carreño", "Yopal", "Cumaral", "Inirida", "Leticia", "San Jose del Guaviare",
    "Puerto Colombia", "Cartagena", "Riohacha", "Santa Marta", "Valledupar", "Curumani", "El Banco", "Plato",
    "Corozal", "Sahagun", "Bogota", "Fusagasuga", "Girardot", "Arbelaez", "Gacheta", "Soacha", "Zipaquira",
    "Facatativa", "Tunja", "Sogamoso", "Duitama", "Chiquinquira", "Garagoa", "Soata", "Boavita", "Cubara",
    "Socha", "Bucaramanga", "Malaga", "Velez", "Ocana", "Barrancabermeja", "Cucuta", "Pamplona", "Palmira",
    "Popayan", "Santander de Quilichao", "Cali", "El Bordo", "Tumaco", "Pasto", "Medellin", "La Dorada",
    "Turbo", "Dosquebradas", "Quibdo", "Neiva", "Pitalito", "La Plata", "Florencia", "Ibague", "Libano",
    "Mariquita", "Puerto Asis", "Valle del Guamuez", "San Vicente del Caguan"
];

const NORMALIZED_CITY_MAP = VALID_UNAD_CITIES_RAW.reduce((acc, city) => {
    acc[city.toUpperCase().replace(/[^\w\s]/g, '')] = city;
    return acc;
}, {});

const VALID_UNAD_CITIES_NORMALIZED_SORTED = VALID_UNAD_CITIES_RAW
    .map(city => city.toUpperCase().replace(/[^\w\s]/g, ''))
    .sort((a, b) => b.length - a.length);

function App() {
    // Estado para el input del QR
    const [qrInput, setQrInput] = useState('');
    // Estado para los mensajes de estado
    const [statusMessage, setStatusMessage] = useState('Esperando escaneo...');
    // Estado para el tipo de mensaje (success, warning, error)
    const [statusType, setStatusType] = useState('default');
    // Estado para almacenar los registros (simulación de la tabla Excel)
    const [registeredData, setRegisteredData] = useState(() => {
        // Cargar datos de localStorage al iniciar (persistencia básica)
        const savedData = localStorage.getItem('qrRegisters');
        return savedData ? JSON.parse(savedData) : [];
    });

    // Efecto para guardar registeredData en localStorage cada vez que cambia
    useEffect(() => {
        localStorage.setItem('qrRegisters', JSON.stringify(registeredData));
    }, [registeredData]);

    // Función para procesar los datos del QR
    const procesarQrData = (datosQr) => {
        const now = new Date();
        const formattedNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

        const match = datosQr.match(/(.+?)(\d{10})(.+)(Valido hasta \d{2} de [A-Za-z]+ de \d{4})/i);

        if (!match) {
            return {
                message: '❌ Código QR inválido. Formato no reconocido (esperado: Nombre<10 dígitos>ProgramaCiudadValido hasta DD de Mes de AAAA).',
                type: 'error',
                extra: {}
            };
        }

        const nombre = match[1].trim();
        const documentoStr = match[2].trim();
        const programaCiudadRaw = match[3].trim();
        const vigencia = match[4].trim();

        let ciudadIdentificada = null;
        let programa = null;

        const normalizedProgramaCiudadRaw = programaCiudadRaw.toUpperCase().replace(/[^\w\s]/g, '');

        for (const normalizedCityNameInList of VALID_UNAD_CITIES_NORMALIZED_SORTED) {
            const normalizedCityNameInListNoSpace = normalizedCityNameInList.replace(/\s/g, '');

            if (normalizedProgramaCiudadRaw.endsWith(normalizedCityNameInListNoSpace)) {
                // Get the original city name from the map
                ciudadIdentificada = NORMALIZED_CITY_MAP[normalizedCityNameInList];

                // Calculate program part length based on original city name length
                const lenProgramaPart = programaCiudadRaw.length - ciudadIdentificada.length;
                programa = programaCiudadRaw.substring(0, lenProgramaPart).trim();
                break;
            }
        }

        if (!ciudadIdentificada) {
            return {
                message: '❌ Código QR inválido. No se pudo identificar una ciudad válida de la UNAD en el formato.',
                type: 'error',
                extra: {}
            };
        }

        const documento = parseInt(documentoStr, 10);

        // Simular búsqueda de registro abierto
        const existingEntryIndex = registeredData.findIndex(
            entry => entry.Documento === documento && (entry.Salida === null || entry.Salida === 'None' || entry.Salida === 'nan')
        );

        let message = '';
        let type = 'success';
        let newRegisteredData = [...registeredData];

        const commonDetails = {
            nombre,
            documento,
            programa,
            ciudad: ciudadIdentificada,
            vigencia
        };

        if (existingEntryIndex !== -1) {
            // Registrar salida
            newRegisteredData[existingEntryIndex].Salida = formattedNow;
            message = '👋 Salida registrada para:';
        } else {
            // Registrar entrada
            const newEntry = {
                Nombre: nombre,
                Documento: documento,
                Programa: programa,
                Entrada: formattedNow,
                Salida: null,
                Ciudad: ciudadIdentificada,
                Vigencia: vigencia
            };
            newRegisteredData.push(newEntry);
            message = '✅ Entrada registrada para:';
        }

        setRegisteredData(newRegisteredData);
        return { message, type, extra: commonDetails };
    };

    // Función del botón de registro
    const handleRegister = () => {
        if (qrInput.trim() === '') {
            updateStatus('Por favor escanee o pegue un código QR.', 'warning');
            return;
        }

        const result = procesarQrData(qrInput);
        updateStatus(result.message, result.type, result.extra);
        setQrInput(''); // Limpiar el campo
    };

    // Actualizar el estado del mensaje en la UI
    const updateStatus = (message, type, extra = {}) => {
        let fullMessage = message;
        if (Object.keys(extra).length > 0) {
            fullMessage += `
  Nombre: ${extra.nombre || 'N/A'}
  Documento: ${extra.documento || 'N/A'}
  Programa: ${extra.programa || 'N/A'}
  Ciudad: ${extra.ciudad || 'N/A'}
  Vigencia: ${extra.vigencia || 'N/A'}`;
        }
        setStatusMessage(fullMessage);
        setStatusType(type);
    };

    // Función para generar y descargar el reporte CSV
    const generateCsvReport = () => {
        if (registeredData.length === 0) {
            alert('No hay datos para generar el reporte CSV.');
            return;
        }

        // Crear el encabezado CSV
        const headers = Object.keys(registeredData[0]);
        const csvContent = [
            headers.join(','), // Headers row
            ...registeredData.map(row => headers.map(header => {
                let value = row[header];
                if (value === null || value === undefined) {
                    value = '';
                } else if (typeof value === 'string' && value.includes(',')) {
                    // Escape commas in string values
                    value = `"${value}"`;
                }
                return value;
            }).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', 'registro_qr_reporte.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        updateStatus('Reporte CSV generado y descargado.', 'success');
    };

    // Determinar el color del mensaje de estado
    let statusTextColor = 'text-gray-700';
    if (statusType === 'success') {
        statusTextColor = 'text-green-700';
    } else if (statusType === 'warning') {
        statusTextColor = 'text-orange-700';
    } else if (statusType === 'error') {
        statusTextColor = 'text-red-700';
    }

    return (
        <div className="flex h-screen bg-gray-200 p-8 font-inter">
            {/* Contenedor principal de la aplicación */}
            <div className="flex w-full max-w-5xl mx-auto bg-white rounded-lg shadow-xl overflow-hidden">
                {/* Panel Izquierdo (Menú Lateral Simulado) */}
                <div className="w-1/4 bg-gradient-to-br from-teal-500 to-teal-700 text-white p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center mb-10">
                            {/* Icono de flecha simulado */}
                            <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                            <h1 className="text-2xl font-bold">QR Registration</h1>
                        </div>

                        {/* QR Code Icon (Simulated) */}
                        <div className="bg-white p-4 rounded-lg flex items-center justify-center mb-8">
                            <svg className="w-24 h-24 text-teal-600" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 11h8V3H3v8zm0 10h8v-8H3v8zm10 0h8v-8h-8v8zm0-18v8h8V3h-8z"></path>
                            </svg>
                        </div>

                        <div className="mb-8">
                            <h2 className="text-lg font-semibold mb-4 opacity-80">Registration</h2>
                            <div className="space-y-3">
                                {['Fyelion', 'Registration', 'Croatlier', 'Fyerion', 'Coreinitor', 'Semcation'].map(item => (
                                    <div key={item} className="flex items-center py-2 px-3 rounded-md hover:bg-teal-600 cursor-pointer transition duration-200">
                                        <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                                        <span className="text-sm">{item}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* Placeholder para la sección de 'Morm' */}
                    <div>
                        <button className="w-full bg-white text-teal-700 font-bold py-3 px-4 rounded-lg shadow-md hover:bg-gray-100 transition duration-200">
                            Morm
                        </button>
                    </div>
                </div>

                {/* Panel Derecho (Contenido Principal) */}
                <div className="w-3/4 p-8 flex flex-col">
                    <div className="flex justify-between items-center mb-10">
                        <h1 className="text-3xl font-bold text-gray-800">QR Registration System</h1>
                        <div className="flex items-center space-x-4 text-gray-600">
                            <svg className="w-6 h-6 cursor-pointer hover:text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            <svg className="w-6 h-6 cursor-pointer hover:text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                                <img src="https://placehold.co/32x32/cccccc/white?text=👤" alt="User" className="rounded-full" />
                            </div>
                        </div>
                    </div>

                    {/* Registration Details Section */}
                    <div className="mb-10">
                        <h2 className="text-xl font-semibold text-gray-800 mb-5">Registration Details</h2>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="qr-input" className="block text-gray-700 text-sm font-medium mb-2">Escanea o pega el código QR:</label>
                                <input
                                    type="text"
                                    id="qr-input"
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    value={qrInput}
                                    onChange={(e) => setQrInput(e.target.value)}
                                    placeholder="Pegue aquí el código QR"
                                />
                            </div>

                            {/* Status message display */}
                            <div className={`p-4 rounded-lg ${statusType === 'success' ? 'bg-green-100 border border-green-300' : statusType === 'error' ? 'bg-red-100 border border-red-300' : statusType === 'warning' ? 'bg-orange-100 border border-orange-300' : 'bg-gray-100 border border-gray-300'} ${statusTextColor} text-sm whitespace-pre-wrap`}>
                                {statusMessage}
                            </div>
                        </div>
                    </div>

                    {/* Buttons Section */}
                    <div className="flex space-x-4 mb-8">
                        <button
                            className="flex-1 bg-teal-500 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-teal-600 transition duration-200"
                            onClick={handleRegister}
                        >
                            Registrar Entrada/Salida
                        </button>
                        <button
                            className="flex-1 bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-lg shadow-md hover:bg-gray-400 transition duration-200"
                            onClick={generateCsvReport}
                        >
                            Generar Reporte CSV
                        </button>
                    </div>

                    {/* Recent Registrations Table (Optional, can be expanded for dashboard) */}
                    <div className="mt-auto"> {/* Pushes to the bottom */}
                        <h3 className="text-lg font-semibold text-gray-800 mb-3">Registros Recientes</h3>
                        {registeredData.length > 0 ? (
                            <div className="overflow-x-auto bg-white rounded-lg shadow-md">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            {Object.keys(registeredData[0]).map(key => (
                                                <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{key}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {registeredData.slice(-5).reverse().map((row, index) => ( // Muestra los últimos 5 registros
                                            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                {Object.values(row).map((value, idx) => (
                                                    <td key={idx} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {value === null || value === 'None' ? '-' : value}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">No hay registros aún.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
