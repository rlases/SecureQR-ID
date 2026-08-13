// src/components/RegistrationForm.jsx

import React, { useRef, useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ROLES, ROLE_NAMES } from "../constants/appConstants.js";

// Helper robusto: convierte a milisegundos y evita NaN
const toMs = (v) => {
  if (!v) return 0;
  // Reemplaza el espacio por 'T' para compatibilidad con el formato ISO en todos los navegadores
  const s = typeof v === "string" ? v.replace(" ", "T") : v;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
};

// Helper para obtener el tiempo del último evento (entrada o salida)
const getEventTime = (record) =>
  Math.max(toMs(record.Salida), toMs(record.Entrada));

function RegistrationForm({
  qrInput,
  setQrInput,
  statusMessage,
  statusType,
  handleRegister,
  generateCsvReport,
  registeredData,
  onEdit,
  onDelete,
  pendingRegistration,
  onRoleSelectForNewUser,
  recentRecordsFilter,
  isSubmitting,
  currentView,
}) {
  const inputRef = useRef(null);
  const [activeMenu, setActiveMenu] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const menuRef = useRef(null);

  const autoSubmitTimerRef = useRef(null);
  const idleTimerRef = useRef(null);

  // --- LÓGICA ANTI-DOBLE ENVÍO ---
  const sendingRef = useRef(false);
  const lastScanRef = useRef({ value: "", at: 0 });

  // Limpieza global de timers al desmontar el componente
  useEffect(() => {
    return () => {
      if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Foco automático por inactividad (10 segundos) y condicional a la vista
  useEffect(() => {
    if (currentView !== "register") {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (
          !pendingRegistration &&
          document.activeElement !== inputRef.current
        ) {
          inputRef.current?.focus();
        }
      }, 10000); // 10 segundos de inactividad
    };

    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ];
    activityEvents.forEach((event) =>
      window.addEventListener(event, resetIdleTimer)
    );
    resetIdleTimer();

    return () => {
      activityEvents.forEach((event) =>
        window.removeEventListener(event, resetIdleTimer)
      );
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [pendingRegistration, currentView]);

  // Foco automático DESPUÉS de un registro o cambio de estado
  useEffect(() => {
    if (currentView === "register" && !pendingRegistration && !isSubmitting) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [statusMessage, pendingRegistration, isSubmitting, currentView]);

  // Auto-envío (500ms) y prevención de doble entrada
  useEffect(() => {
    if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);

    if (
      qrInput.trim() !== "" &&
      !pendingRegistration &&
      !isSubmitting &&
      !sendingRef.current
    ) {
      // Capturamos el valor del input al momento de programar el timer
      const valueAtSchedule = qrInput.trim();

      // anti-bounce por 500 ms para evitar doble disparo timer+enter/escáner
      autoSubmitTimerRef.current = setTimeout(() => {
        // Re-check a tiempo de ejecución
        if (
          sendingRef.current ||
          pendingRegistration ||
          isSubmitting ||
          !valueAtSchedule
        )
          return;

        // Evitar re-envíos idénticos por si cambió el input
        if (
          lastScanRef.current.value === valueAtSchedule &&
          Date.now() - lastScanRef.current.at < 1500
        )
          return;

        sendingRef.current = true;
        Promise.resolve(handleRegister(valueAtSchedule)).finally(() => {
          sendingRef.current = false;
          lastScanRef.current = { value: valueAtSchedule, at: Date.now() };
          // Limpiar el input después de un registro exitoso
          setQrInput?.("");
        });
      }, 500);
    }
    return () => {
      if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
    };
  }, [qrInput, handleRegister, pendingRegistration, isSubmitting, setQrInput]);

  // Highlight de la última fila actualizada
  useEffect(() => {
    if (!registeredData?.length) return;
    const lastRecord = registeredData.reduce((latest, current) =>
      getEventTime(current) > getEventTime(latest) ? current : latest
    );

    // Usamos el mismo criterio de getEventTime para el highlight
    const lastEventTime = getEventTime(lastRecord);
    setLastUpdated(
      Number.isFinite(lastEventTime)
        ? `${lastEventTime}_${lastRecord.Documento}`
        : null
    );
  }, [registeredData]);

  // Efecto para cerrar el menú contextual cuando cambian los datos
  useEffect(() => {
    setActiveMenu(null);
  }, [registeredData]);

  // Listener para cerrar el menú contextual al hacer clic fuera
  useEffect(() => {
    if (!activeMenu) return;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeMenu]);

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && qrInput.trim() !== "") {
      e.preventDefault();
      if (sendingRef.current) return;

      // Cancelar el auto-submit si se presiona Enter
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }

      const now = Date.now();
      const value = qrInput.trim();
      if (
        lastScanRef.current.value === value &&
        now - lastScanRef.current.at < 1500
      )
        return;

      sendingRef.current = true;
      Promise.resolve(handleRegister(value)).finally(() => {
        sendingRef.current = false;
        lastScanRef.current = { value, at: now };
        setQrInput?.("");
      });
    }
  };

  const statusBgColors = {
    success: "bg-green-100",
    error: "bg-red-100",
    warning: "bg-orange-100",
    default: "bg-gray-100",
  };

  const statusTextColors = {
    success: "text-green-700",
    error: "text-red-700",
    warning: "text-orange-700",
    default: "text-gray-700",
  };

  const getTableHeaders = () => [
    "Nombre",
    "Documento",
    "Rol",
    "Programa/Cargo",
    "Entrada",
    "Salida",
    "Ciudad",
    "",
  ];

  // Memoización del filtrado y ordenado para evitar recomputaciones costosas
  const filteredRecentData = useMemo(() => {
    if (!registeredData) return [];
    if (!recentRecordsFilter || recentRecordsFilter === "all")
      return registeredData;
    return registeredData.filter(
      (r) =>
        typeof r.Rol === "string" &&
        r.Rol.toLowerCase() === recentRecordsFilter.toLowerCase()
    );
  }, [registeredData, recentRecordsFilter]);

  const sortedData = useMemo(
    () =>
      [...filteredRecentData].sort((a, b) => getEventTime(b) - getEventTime(a)),
    [filteredRecentData]
  );

  const toLocal = (v) => {
    if (!v) return "-";
    const s = typeof v === "string" ? v.replace(" ", "T") : v;
    const d = new Date(s);
    return isNaN(d.getTime()) ? "-" : d.toLocaleString();
  };

  const recentRecordsTitle =
    recentRecordsFilter === "all"
      ? "Registros recientes (Todos los roles)"
      : `Registros Recientes de ${
          ROLE_NAMES[recentRecordsFilter] || "Desconocido"
        }s`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full p-8 flex flex-col h-full overflow-y-auto"
    >
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold text-gray-800">
          Sistema de Registro QR
        </h1>
      </div>

      {pendingRegistration ? (
        <div className="text-center p-6 bg-blue-50 rounded-lg shadow-md mb-8">
          <h3 className="text-xl font-semibold text-blue-800 mb-4">
            Nuevo Usuario Detectado: {pendingRegistration.Nombre}
          </h3>
          <p className="text-gray-600 mb-6">
            Por favor, selecciona el rol para completar el registro:
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              className="bg-teal-500 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-teal-600"
              onClick={() => onRoleSelectForNewUser(ROLES.MONITOR)}
            >
              Monitor
            </button>
            <button
              className="bg-blue-500 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-blue-600"
              onClick={() => onRoleSelectForNewUser(ROLES.ESTUDIANTE)}
            >
              Estudiante
            </button>
            <button
              className="bg-purple-500 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-purple-600"
              onClick={() => onRoleSelectForNewUser(ROLES.DOCENTE)}
            >
              Docente
            </button>
            <button
              className="bg-orange-500 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-orange-600"
              onClick={() => onRoleSelectForNewUser(ROLES.ADMINISTRATIVO)}
            >
              Administrativo
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-10">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="qr-input"
                className="block text-gray-700 text-sm font-medium mb-2"
              >
                Escanea o pega el código QR:
              </label>
              <input
                ref={inputRef}
                type="text"
                id="qr-input"
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Esperando código QR..."
                // Deshabilita el input si no está en la vista de "register"
                disabled={
                  !!pendingRegistration ||
                  isSubmitting ||
                  currentView !== "register"
                }
              />
            </div>
            <div
              className={`p-4 rounded-lg ${
                statusBgColors[statusType] || "bg-gray-100"
              } ${
                statusTextColors[statusType] || "text-gray-700"
              } text-sm whitespace-pre-wrap`}
            >
              {statusMessage}
            </div>
          </div>
        </div>
      )}

      <div className="flex space-x-4 mb-8">
        <button
          className="flex-1 bg-gray-300 text-gray-800 font-bold py-3 px-6 rounded-lg shadow-md hover:bg-gray-400"
          onClick={generateCsvReport}
        >
          Generar Reporte CSV
        </button>
      </div>

      <div className="mt-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          {recentRecordsTitle}
        </h3>
        {sortedData.length > 0 ? (
          <div className="overflow-x-auto bg-white rounded-lg shadow-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {getTableHeaders().map((header) => (
                    <th
                      key={header}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedData.slice(0, 5).map((row, index) => {
                  const uniqueKey = `${getEventTime(row)}_${row.Documento}`;
                  const menuPositionClass =
                    index === 0 ? "top-full mt-2" : "bottom-full mb-2";
                  return (
                    <tr
                      key={uniqueKey}
                      className={
                        lastUpdated === uniqueKey ? "highlight-row" : ""
                      }
                    >
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.Nombre}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.Documento}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.Rol}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.Programa === "N/A" ? row.Cargo : row.Programa}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {toLocal(row.Entrada)}
                      </td>
                      {/* Lógica para manejar 'Salida' sin mostrar 'Invalid Date' */}
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(() => {
                          const v = row.Salida;
                          const invalids = new Set([
                            "",
                            "null",
                            "none",
                            "nan",
                            "invalid date",
                          ]);
                          const ok =
                            v && !invalids.has(String(v).trim().toLowerCase());
                          if (!ok) return "-";
                          const d = new Date(v);
                          return isNaN(d.getTime()) ? "-" : d.toLocaleString();
                        })()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.Ciudad}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-right relative">
                        <div ref={activeMenu === uniqueKey ? menuRef : null}>
                          <button
                            onClick={() =>
                              setActiveMenu(
                                activeMenu === uniqueKey ? null : uniqueKey
                              )
                            }
                            className="text-gray-500 hover:text-gray-700 p-1 rounded-full"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>
                            </svg>
                          </button>
                          {activeMenu === uniqueKey && (
                            <div
                              className={`absolute right-0 ${menuPositionClass} w-48 bg-white rounded-md shadow-lg z-10 border`}
                            >
                              <button
                                onClick={() => {
                                  onEdit(row);
                                  setActiveMenu(null);
                                }}
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                Editar Registro
                              </button>
                              <button
                                onClick={() => {
                                  onDelete(row);
                                  setActiveMenu(null);
                                }}
                                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                              >
                                Eliminar Registro
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            No hay registros recientes para el filtro seleccionado.
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default RegistrationForm;
