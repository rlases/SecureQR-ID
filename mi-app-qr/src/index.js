// src/index.js (o src/main.jsx si usas Vite)

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // <-- Esta línea es CRUCIAL para cargar Tailwind
import App from './App';
// Puedes quitar o dejar reportWebVitals si no lo usas
// import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Si tu proyecto usa reportWebVitals, mantenlo
// reportWebVitals();
            