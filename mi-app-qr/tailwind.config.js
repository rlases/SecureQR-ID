// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                inter: ['Inter', 'sans-serif'],
            },
            // Puedes añadir la marca de agua aquí si decides reintroducirla en el futuro
            // O borrar esta sección si no la usas en ningún lugar
            // backgroundImage: {
            //   'unad-watermark': "url('/Mesa_de_trabajo_1-removebg-preview.png')",
            // }
        },
    },
    plugins: [],
}
