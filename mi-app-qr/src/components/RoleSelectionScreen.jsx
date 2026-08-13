// src/components/RoleSelectionScreen.jsx

import React from "react";
import { motion } from "framer-motion";
import { ROLES } from "../constants/appConstants.js";

function RoleSelectionScreen({ onRoleSelect }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full p-8 flex flex-col items-center justify-center h-full"
    >
      <h1 className="text-3xl font-bold text-gray-800 mb-8">
        Seleccionar Tipo de Registro
      </h1>
      <div className="flex flex-wrap justify-center gap-6">
        <button
          className="bg-teal-500 text-white font-bold py-4 px-8 rounded-lg shadow-md hover:bg-teal-600 transition duration-200 text-xl"
          onClick={() => onRoleSelect(ROLES.MONITOR)}
        >
          Registrar Monitor
        </button>
        <button
          className="bg-blue-500 text-white font-bold py-4 px-8 rounded-lg shadow-md hover:bg-blue-600 transition duration-200 text-xl"
          onClick={() => onRoleSelect(ROLES.ESTUDIANTE)}
        >
          Registrar Estudiante
        </button>
        <button
          className="bg-purple-500 text-white font-bold py-4 px-8 rounded-lg shadow-md hover:bg-purple-600 transition duration-200 text-xl"
          onClick={() => onRoleSelect(ROLES.DOCENTE)}
        >
          Registrar Docente
        </button>
        <button
          className="bg-orange-500 text-white font-bold py-4 px-8 rounded-lg shadow-md hover:bg-orange-600 transition duration-200 text-xl"
          onClick={() => onRoleSelect(ROLES.ADMINISTRATIVO)}
        >
          Registrar Administrativo
        </button>
      </div>
    </motion.div>
  );
}

export default RoleSelectionScreen;
