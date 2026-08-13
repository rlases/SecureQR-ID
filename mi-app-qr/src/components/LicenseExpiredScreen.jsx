// src/components/LicenseExpiredScreen.jsx
import React from "react";

// Componente para mostrar cuando la licencia ha expirado o ha sido manipulada.
const LicenseExpiredScreen = ({ status }) => {
  const messages = {
    EXPIRED: {
      title: "Periodo de Prueba Finalizado",
      message:
        "Tu licencia de prueba ha expirado. Por favor, contacta al administrador para adquirir una licencia completa.",
      icon: "📅",
    },
    TAMPERED: {
      title: "Licencia Inválida",
      message:
        "Se ha detectado una manipulación en el sistema (como un cambio en la fecha del reloj). La aplicación ha sido bloqueada. Contacta al soporte técnico.",
      icon: "🚫",
    },
    ERROR: {
      title: "Error de Licencia",
      message:
        "Ocurrió un error al verificar la licencia. Por favor, reinicia la aplicación o contacta al soporte.",
      icon: "⚠️",
    },
  };

  const { title, message, icon } = messages[status] || messages.ERROR;

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 text-gray-800 p-8 text-center">
      <div className="bg-white p-10 rounded-2xl shadow-2xl max-w-md w-full border-t-4 border-red-500">
        <div className="text-6xl mb-6">{icon}</div>
        <h1 className="text-3xl font-bold text-red-600 mb-4">{title}</h1>
        <p className="text-lg text-gray-600">{message}</p>
        <p className="text-sm text-gray-400 mt-8">Registro QR v0.1.5</p>
      </div>
    </div>
  );
};

export default LicenseExpiredScreen;
