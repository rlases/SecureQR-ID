// src/constants/unadCities.js

// Lista de ciudades de las sedes UNAD (normalizadas y ordenadas por longitud descendente)
export const VALID_UNAD_CITIES_RAW = [
    "Acacías", "Acacias", "Puerto Carreño", "Puerto Carreno", "Yopal", "Cumaral", "Inírida", "Inirida", "Leticia", "San José del Guaviare", "San Jose del Guaviare", "Puerto Colombia", "Cartagena", "Riohacha", "Santa Marta", "Valledupar", "Curumaní", "Curumani", "El Banco", "Plato", "Corozal", "Sahagún", "Sahagun", "Bogotá", "Bogota", "Fusagasugá", "Fusagasuga", "Girardot", "Arbeláez", "Arbelaez", "Gachetá", "Gacheta", "Soacha", "Zipaquirá", "Zipaquira", "Facatativá", "Facatativa", "Tunja", "Sogamoso", "Duitama", "Chiquinquirá", "Chiquinquira", "Garagoa", "Soatá", "Soata", "Boavita", "Cubará", "Cubara", "Socha", "Bucaramanga", "Málaga", "Malaga", "Vélez", "Velez", "Ocaña", "Ocana", "Barrancabermeja", "Cúcuta", "Cucuta", "Pamplona", "Palmira", "Popayán", "Popayan", "Santander de Quilichao", "Cali", "El Bordo", "Tumaco", "Pasto", "Medellín", "Medellin", "La Dorada", "Turbo", "Dosquebradas", "Quibdó", "Quibdo", "Neiva", "Pitalito", "La Plata", "Florencia", "Ibagué", "Ibague", "Líbano", "Libano", "Mariquita", "Puerto Asís", "Puerto Asis", "Valle del Guamuéz", "Valle del Guamuez", "San Vicente del Caguán", "San Vicente del Caguan"
];

// Crear un mapeo de nombre normalizado a nombre original para la visualización
export const NORMALIZED_CITY_MAP = VALID_UNAD_CITIES_RAW.reduce((acc, city) => {
    acc[city.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s/g, '')] = city;
    return acc;
}, {});

// Ordenar las ciudades normalizadas por longitud de forma descendente para una mejor coincidencia
export const VALID_UNAD_CITIES_NORMALIZED_SORTED = VALID_UNAD_CITIES_RAW
    .map(city => city.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s/g, ''))
    .sort((a, b) => b.length - a.length);
