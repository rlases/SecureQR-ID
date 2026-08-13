// src/components/ExportCsvModal.jsx

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ROLES, ROLE_NAMES } from "../constants/appConstants.js";

function ExportCsvModal({ isOpen, onCancel, onExport }) {
  if (!isOpen) {
    return null;
  }

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { type: "spring", stiffness: 300, damping: 30 },
    },
    exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <motion.div
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4"
            variants={modalVariants}
          >
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              Exportar Reporte CSV
            </h2>
            <p className="text-gray-600 mb-6">
              Selecciona qué registros deseas exportar:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => onExport("all")}
                className="w-full bg-teal-500 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-teal-600 transition duration-200"
              >
                Todos los Roles
              </button>
              <button
                onClick={() => onExport(ROLES.MONITOR)}
                className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg shadow-sm hover:bg-gray-300 transition duration-200"
              >
                {ROLE_NAMES[ROLES.MONITOR]}
              </button>
              <button
                onClick={() => onExport(ROLES.ESTUDIANTE)}
                className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg shadow-sm hover:bg-gray-300 transition duration-200"
              >
                {ROLE_NAMES[ROLES.ESTUDIANTE]}
              </button>
              <button
                onClick={() => onExport(ROLES.DOCENTE)}
                className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg shadow-sm hover:bg-gray-300 transition duration-200"
              >
                {ROLE_NAMES[ROLES.DOCENTE]}
              </button>
              <button
                onClick={() => onExport(ROLES.ADMINISTRATIVO)}
                className="w-full bg-gray-200 text-gray-800 font-bold py-3 px-4 rounded-lg shadow-sm hover:bg-gray-300 transition duration-200"
              >
                {ROLE_NAMES[ROLES.ADMINISTRATIVO]}
              </button>
            </div>
            <div className="flex justify-end mt-8">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition duration-200"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ExportCsvModal;
