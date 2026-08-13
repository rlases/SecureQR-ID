// src/components/ForgottenOutModal.jsx

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

function ForgottenOutModal({ isOpen, record, onCorrect, onForce, onCancel }) {
  if (!isOpen || !record) {
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
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4"
            variants={modalVariants}
          >
            <h2 className="text-xl font-bold text-orange-600 mb-4">
              ¡Atención! Sesión Abierta Detectada
            </h2>
            <p className="text-gray-700 mb-2">
              Se detectó un registro de entrada sin salida para{" "}
              <span className="font-semibold">{record.Nombre}</span> del día{" "}
              <span className="font-semibold">
                {new Date(record.Entrada).toLocaleDateString()}.
              </span>
            </p>
            <p className="text-gray-600 mb-6">¿Qué deseas hacer?</p>
            <div className="space-y-4">
              <button
                onClick={onCorrect}
                className="w-full text-left p-4 bg-teal-50 rounded-lg border border-teal-200 hover:bg-teal-100 transition duration-200"
              >
                <p className="font-bold text-teal-700">
                  Corregir Salida y Registrar Nueva Entrada (Recomendado)
                </p>
                <p className="text-sm text-teal-600">
                  Se pedirá autorización para editar la hora de salida del
                  registro anterior y luego se registrará la entrada de hoy.
                </p>
              </button>
              <button
                onClick={onForce}
                className="w-full text-left p-4 bg-yellow-50 rounded-lg border border-yellow-200 hover:bg-yellow-100 transition duration-200"
              >
                <p className="font-bold text-yellow-700">
                  Forzar Nueva Entrada (Dejar la anterior abierta)
                </p>
                <p className="text-sm text-yellow-600">
                  Se registrará una nueva entrada sin modificar el registro
                  anterior. Requiere autorización.
                </p>
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

export default ForgottenOutModal;
