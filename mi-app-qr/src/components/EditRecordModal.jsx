// src/components/EditRecordModal.jsx

import React, { useState, useEffect } from "react";
import { ROLE_NAMES } from "../constants/appConstants.js";

// Helper para formatear la fecha a un string compatible con datetime-local sin conversiones de zona horaria
const formatToLocalDateTimeString = (dateString) => {
  if (!dateString || dateString === "None" || dateString === "nan") return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return ""; // Comprobar si la fecha es válida

  const pad = (num) => num.toString().padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

function EditRecordModal({ isOpen, record, onSave, onCancel }) {
  const [entrada, setEntrada] = useState("");
  const [salida, setSalida] = useState("");
  const [rol, setRol] = useState("");

  useEffect(() => {
    if (record) {
      setEntrada(formatToLocalDateTimeString(record.Entrada));
      setSalida(formatToLocalDateTimeString(record.Salida));
      setRol(record.Rol || "");
    }
  }, [record]);

  if (!isOpen) {
    return null;
  }

  const handleSave = () => {
    const newEntradaDate = entrada
      ? new Date(entrada).toLocaleString("sv-SE")
      : record.Entrada;
    const newSalidaDate = salida
      ? new Date(salida).toLocaleString("sv-SE")
      : null;
    onSave(record, newEntradaDate, newSalidaDate, rol);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          Editar Registro
        </h2>
        <p className="text-gray-600 mb-4">
          Editando registro para:{" "}
          <span className="font-semibold">{record.Nombre}</span>
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="entrada-input"
              className="block text-sm font-medium text-gray-700"
            >
              Fecha y Hora de Entrada
            </label>
            <input
              type="datetime-local"
              id="entrada-input"
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="salida-input"
              className="block text-sm font-medium text-gray-700"
            >
              Fecha y Hora de Salida
            </label>
            <input
              type="datetime-local"
              id="salida-input"
              value={salida}
              onChange={(e) => setSalida(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="rol-select"
              className="block text-sm font-medium text-gray-700"
            >
              Rol
            </label>
            <select
              id="rol-select"
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-sm"
            >
              {Object.values(ROLE_NAMES).map((roleName) => (
                <option key={roleName} value={roleName}>
                  {roleName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end space-x-4 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition duration-200"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition duration-200"
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditRecordModal;
