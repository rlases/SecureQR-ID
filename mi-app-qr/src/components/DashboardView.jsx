// src/components/DashboardView.jsx

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from "recharts";
import { ROLES, ROLE_NAMES } from "../constants/appConstants";

function DashboardView({ registeredData, userActiveRole }) {
  const [chartDataProgram, setChartDataProgram] = useState([]);
  const [chartDataDuration, setChartDataDuration] = useState([]);
  const [chartDataDailyEntries, setChartDataDailyEntries] = useState([]);
  const [chartDataDailyExits, setChartDataDailyExits] = useState([]);
  const [monitorDetails, setMonitorDetails] = useState([]);
  const [selectedMonitorDoc, setSelectedMonitorDoc] = useState("all");
  const [selectedPeriod, setSelectedPeriod] = useState("hoy");
  const [selectedDashboardRole, setSelectedDashboardRole] = useState(
    userActiveRole || "all"
  );
  const [peopleInsideCount, setPeopleInsideCount] = useState(0);
  const [peopleInsideList, setPeopleInsideList] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPeopleInsideVisible, setIsPeopleInsideVisible] = useState(false);
  const peopleInsideRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        peopleInsideRef.current &&
        !peopleInsideRef.current.contains(event.target)
      ) {
        setIsPeopleInsideVisible(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [peopleInsideRef]);

  useEffect(() => {
    if (userActiveRole) {
      setSelectedDashboardRole(userActiveRole);
    } else {
      setSelectedDashboardRole("all");
    }
  }, [userActiveRole]);

  useEffect(() => {
    if (!registeredData || registeredData.length === 0) {
      setChartDataProgram([]);
      setChartDataDuration([]);
      setChartDataDailyEntries([]);
      setChartDataDailyExits([]);
      setMonitorDetails([]);
      setPeopleInsideCount(0);
      setPeopleInsideList([]);
      return;
    }

    const processData = () => {
      let df = registeredData.map((row) => ({
        ...row,
        Entrada: new Date(row.Entrada),
        Salida:
          row.Salida &&
          row.Salida !== "null" &&
          row.Salida !== "None" &&
          row.Salida !== "nan"
            ? new Date(row.Salida)
            : null,
      }));

      let filteredByDashboardRoleDf = df;
      if (selectedDashboardRole !== "all") {
        filteredByDashboardRoleDf = df.filter(
          (row) =>
            row.Rol &&
            typeof row.Rol === "string" &&
            row.Rol.toLowerCase() === selectedDashboardRole
        );
      }

      const currentlyInsideRecords = filteredByDashboardRoleDf.filter(
        (row) => row.Salida === null
      );
      setPeopleInsideCount(currentlyInsideRecords.length);
      setPeopleInsideList(currentlyInsideRecords.map((p) => p.Nombre));

      let searchedDf = filteredByDashboardRoleDf;
      if (searchTerm.trim() !== "") {
        searchedDf = filteredByDashboardRoleDf.filter((row) =>
          row.Nombre.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      let dfForCharts = searchedDf;
      if (selectedMonitorDoc !== "all") {
        dfForCharts = searchedDf.filter(
          (row) => String(row.Documento) === selectedMonitorDoc
        );
      }

      let startDate = null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedPeriod === "8_dias") {
        startDate = new Date(today);
        const dayOfWeek = startDate.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(startDate.getDate() - daysToMonday);
        startDate.setHours(0, 0, 0, 0);
      } else if (selectedPeriod === "15_dias") {
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 15);
        startDate.setHours(0, 0, 0, 0);
      } else if (selectedPeriod === "1_mes") {
        startDate = new Date(today);
        startDate.setMonth(today.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
      } else if (selectedPeriod === "hoy") {
        startDate = new Date(today);
        startDate.setHours(0, 0, 0, 0);
      }

      const filteredDfByPeriodAndRoleAndPerson = startDate
        ? dfForCharts.filter((row) => row.Entrada >= startDate)
        : dfForCharts;

      const programCountsMap = {};
      filteredDfByPeriodAndRoleAndPerson.forEach((row) => {
        const programOrCargo = row.Programa;
        if (!programCountsMap[programOrCargo]) {
          programCountsMap[programOrCargo] = {
            name: programOrCargo,
            Conteo: 0,
            nombres: [],
            roles: [],
          };
        }
        programCountsMap[programOrCargo].Conteo++;
        programCountsMap[programOrCargo].nombres.push(row.Nombre);
        if (row.Rol) programCountsMap[programOrCargo].roles.push(row.Rol);
      });
      setChartDataProgram(Object.values(programCountsMap));

      const completedEntries = filteredDfByPeriodAndRoleAndPerson.filter(
        (row) => row.Salida !== null
      );
      const durationRangesMap = {
        "0-1h": { count: 0, nombres: [] },
        "1-2h": { count: 0, nombres: [] },
        "2-4h": { count: 0, nombres: [] },
        "4-8h": { count: 0, nombres: [] },
        "8h+": { count: 0, nombres: [] },
      };
      completedEntries.forEach((row) => {
        const diffMs = row.Salida.getTime() - row.Entrada.getTime();
        const durationHours = diffMs / (1000 * 60 * 60);
        let rangeKey;
        if (durationHours <= 1) rangeKey = "0-1h";
        else if (durationHours <= 2) rangeKey = "1-2h";
        else if (durationHours <= 4) rangeKey = "2-4h";
        else if (durationHours <= 8) rangeKey = "4-8h";
        else rangeKey = "8h+";

        durationRangesMap[rangeKey].count++;
        durationRangesMap[rangeKey].nombres.push(row.Nombre);
      });
      setChartDataDuration(
        Object.keys(durationRangesMap).map((key) => ({
          range: key,
          Conteo: durationRangesMap[key].count,
          nombres: durationRangesMap[key].nombres,
        }))
      );

      const dailyEntriesMap = {};
      const dailyExitsMap = {};
      let loopCurrentDay = startDate
        ? new Date(startDate)
        : new Date(
            dfForCharts[0]?.Entrada.toISOString().split("T")[0] || today
          );
      loopCurrentDay.setHours(0, 0, 0, 0);
      const loopEndDate = new Date(today);
      loopEndDate.setHours(0, 0, 0, 0);

      while (loopCurrentDay <= loopEndDate) {
        const dateKey = loopCurrentDay.toISOString().split("T")[0];
        dailyEntriesMap[dateKey] = {
          date: dateKey,
          Entradas: 0,
          morningEntries: 0,
          afternoonEntries: 0,
          nombres: [],
        };
        dailyExitsMap[dateKey] = {
          date: dateKey,
          Salidas: 0,
          morningExits: 0,
          afternoonExits: 0,
          nombres: [],
        };
        loopCurrentDay.setDate(loopCurrentDay.getDate() + 1);
      }

      filteredDfByPeriodAndRoleAndPerson.forEach((row) => {
        const dateKey = row.Entrada.toISOString().split("T")[0];
        if (dailyEntriesMap.hasOwnProperty(dateKey)) {
          dailyEntriesMap[dateKey].Entradas++;
          dailyEntriesMap[dateKey].nombres.push(row.Nombre);
          if (row.Entrada.getHours() < 12) {
            dailyEntriesMap[dateKey].morningEntries++;
          } else {
            dailyEntriesMap[dateKey].afternoonEntries++;
          }
        }
        if (row.Salida) {
          const exitDateKey = row.Salida.toISOString().split("T")[0];
          if (dailyExitsMap.hasOwnProperty(exitDateKey)) {
            dailyExitsMap[exitDateKey].Salidas++;
            dailyExitsMap[exitDateKey].nombres.push(row.Nombre);
            if (row.Salida.getHours() < 12) {
              dailyExitsMap[exitDateKey].morningExits++;
            } else {
              dailyExitsMap[exitDateKey].afternoonExits++;
            }
          }
        }
      });
      setChartDataDailyEntries(
        Object.values(dailyEntriesMap).sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        )
      );
      setChartDataDailyExits(
        Object.values(dailyExitsMap).sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        )
      );

      const uniqueMonitorDocuments = Array.from(
        new Set(searchedDf.map((item) => item.Documento))
      );
      const detailedMonitorInfo = uniqueMonitorDocuments.map((doc) => {
        const monitorEntriesRaw = searchedDf.filter(
          (item) => String(item.Documento) === String(doc)
        );
        const monitorEntriesForTable = registeredData.filter(
          (item) => String(item.Documento) === String(doc)
        );

        const monitorBaseInfo = registeredData.find(
          (item) => String(item.Documento) === String(doc)
        );

        const arrivalMap = new Map();
        monitorEntriesRaw.forEach((entry) => {
          const timestamp = entry.Entrada.getTime();
          const timeDecimal =
            entry.Entrada.getHours() +
            entry.Entrada.getMinutes() / 60 +
            entry.Entrada.getSeconds() / 3600;
          const displayTime = entry.Entrada.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });

          if (!arrivalMap.has(timestamp)) {
            arrivalMap.set(timestamp, {
              date: timestamp,
              time: timeDecimal,
              displayTime: displayTime,
              nombres: [],
              fullEntries: [],
            });
          }
          arrivalMap.get(timestamp).nombres.push(entry.Nombre);
          arrivalMap.get(timestamp).fullEntries.push(entry);
        });
        const arrivalData = Array.from(arrivalMap.values());

        const departureMap = new Map();
        monitorEntriesRaw
          .filter((entry) => entry.Salida)
          .forEach((entry) => {
            const timestamp = entry.Salida.getTime();
            const timeDecimal =
              entry.Salida.getHours() +
              entry.Salida.getMinutes() / 60 +
              entry.Salida.getSeconds() / 3600;
            const displayTime = entry.Salida.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });

            if (!departureMap.has(timestamp)) {
              departureMap.set(timestamp, {
                date: timestamp,
                time: timeDecimal,
                displayTime: displayTime,
                nombres: [],
                fullEntries: [],
              });
            }
            departureMap.get(timestamp).nombres.push(entry.Nombre);
            departureMap.get(timestamp).fullEntries.push(entry);
          });
        const departureData = Array.from(departureMap.values());

        const totalEntriesInSelectedPeriod =
          filteredDfByPeriodAndRoleAndPerson.filter(
            (row) => String(row.Documento) === String(doc)
          ).length;

        return {
          Nombre: monitorBaseInfo.Nombre,
          Documento: monitorBaseInfo.Documento,
          Programa: monitorBaseInfo.Programa,
          Ciudad: monitorBaseInfo.Ciudad,
          Vigencia: monitorBaseInfo.Vigencia,
          Rol: monitorBaseInfo.Rol,
          TotalEntradasPeriodo: totalEntriesInSelectedPeriod,
          Entradas: monitorEntriesForTable.map((e) =>
            e.Entrada.toLocaleString()
          ),
          Salidas: monitorEntriesForTable.map((e) =>
            e.Salida ? e.Salida.toLocaleString() : "-"
          ),
          arrivalData,
          departureData,
        };
      });
      setMonitorDetails(detailedMonitorInfo);
    };

    processData();
  }, [
    registeredData,
    selectedPeriod,
    selectedDashboardRole,
    selectedMonitorDoc,
    searchTerm,
  ]);

  const getFilteredArrivalDepartureData = () => {
    let currentMonitorArrivalData = [];
    let currentMonitorDepartureData = [];

    if (selectedMonitorDoc === "all") {
      currentMonitorArrivalData = monitorDetails.flatMap(
        (monitor) => monitor.arrivalData
      );
      currentMonitorDepartureData = monitorDetails.flatMap(
        (monitor) => monitor.departureData
      );
    } else {
      const selectedMonitor = monitorDetails.find(
        (m) => String(m.Documento) === selectedMonitorDoc
      );
      currentMonitorArrivalData = selectedMonitor
        ? selectedMonitor.arrivalData
        : [];
      currentMonitorDepartureData = selectedMonitor
        ? selectedMonitor.departureData
        : [];
    }

    let startDate = null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedPeriod === "8_dias") {
      startDate = new Date(today);
      const dayOfWeek = startDate.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      startDate.setDate(startDate.getDate() - daysToMonday);
      startDate.setHours(0, 0, 0, 0);
    } else if (selectedPeriod === "15_dias") {
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 15);
      startDate.setHours(0, 0, 0, 0);
    } else if (selectedPeriod === "1_mes") {
      startDate = new Date(today);
      startDate.setMonth(today.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (selectedPeriod === "hoy") {
      startDate = new Date(today);
      startDate.setHours(0, 0, 0, 0);
    }

    const filteredArrivals = startDate
      ? currentMonitorArrivalData.filter(
          (item) => new Date(item.date) >= startDate.getTime()
        )
      : currentMonitorArrivalData;
    const filteredDepartures = startDate
      ? currentMonitorDepartureData.filter(
          (item) => new Date(item.date) >= startDate.getTime()
        )
      : currentMonitorDepartureData;

    return { arrival: filteredArrivals, departure: filteredDepartures };
  };

  const { arrival: filteredArrivalData, departure: filteredDepartureData } =
    getFilteredArrivalDepartureData();

  const formatXAxisDate = (tickItem) => {
    return new Date(tickItem).toLocaleDateString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const formatYAxisTime = (tickItem) => {
    const hours = Math.floor(tickItem);
    const minutes = Math.round((tickItem - hours) * 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}`;
  };

  const CustomTooltip = ({
    active,
    payload,
    label,
    isDailyChart,
    isDurationChart,
    isProgramChart,
    isExitChart,
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      if (isDailyChart) {
        const title = isExitChart ? "Salidas:" : "Entradas:";
        const morningCount = isExitChart
          ? data.morningExits
          : data.morningEntries;
        const afternoonCount = isExitChart
          ? data.afternoonExits
          : data.afternoonEntries;

        return (
          <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-md">
            <p className="text-sm font-bold text-gray-800">
              Fecha: {data.date}
            </p>
            <p className="text-sm font-bold text-gray-800">
              {title} {isExitChart ? data.Salidas : data.Entradas}
            </p>
            {morningCount !== undefined && afternoonCount !== undefined && (
              <div className="mt-1 text-sm text-gray-700">
                <p>Mañana: {morningCount}</p>
                <p>Tarde: {afternoonCount}</p>
              </div>
            )}
            {data.nombres && data.nombres.length > 0 && (
              <div className="mt-1">
                <p className="text-sm font-semibold text-gray-700">Personas:</p>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {data.nombres.map((name, index) => (
                    <li key={index}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      } else if (isDurationChart) {
        return (
          <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-md">
            <p className="text-sm font-bold text-gray-800">
              Rango: {data.range}
            </p>
            <p className="text-sm font-bold text-gray-800">
              Conteo: {data.Conteo}
            </p>
            {data.nombres && data.nombres.length > 0 && (
              <div className="mt-1">
                <p className="text-sm font-semibold text-gray-700">Personas:</p>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {data.nombres.map((name, index) => (
                    <li key={index}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      } else if (isProgramChart) {
        const label =
          selectedDashboardRole === ROLES.MONITOR ||
          selectedDashboardRole === ROLES.ESTUDIANTE
            ? "Programa: "
            : selectedDashboardRole === ROLES.DOCENTE ||
              selectedDashboardRole === ROLES.ADMINISTRATIVO
            ? "Cargo: "
            : "";

        return (
          <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-md">
            <p className="text-sm font-bold text-gray-800">
              {label} {data.name}
            </p>
            <p className="text-sm font-bold text-gray-800">
              Conteo: {data.Conteo}
            </p>
            {data.nombres && data.nombres.length > 0 && (
              <div className="mt-1">
                <p className="text-sm font-semibold text-gray-700">Personas:</p>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {data.nombres.map((name, index) => (
                    <li key={index}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-md">
            <p className="text-sm font-bold text-gray-800">
              Fecha: {formatXAxisDate(data.date)}
            </p>
            <p className="text-sm font-bold text-gray-800">
              Hora: {data.displayTime}
            </p>
            {data.nombres && data.nombres.length > 0 && (
              <div className="mt-1">
                <p className="text-sm font-semibold text-gray-700">Personas:</p>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {data.nombres.map((name, index) => (
                    <li key={index}>{name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      }
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full p-8 flex flex-col h-full overflow-y-auto"
    >
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard en Línea</h1>
        <div ref={peopleInsideRef} className="relative">
          <div
            onClick={() => setIsPeopleInsideVisible((prevState) => !prevState)}
            className="flex items-center space-x-2 cursor-pointer"
          >
            <span className="text-sm text-gray-500">Personas Dentro:</span>
            <span className="flex items-center justify-center bg-teal-100 text-teal-700 text-sm font-bold rounded-full w-6 h-6">
              {peopleInsideCount}
            </span>
          </div>
          {isPeopleInsideVisible && peopleInsideList.length > 0 && (
            <div className="absolute top-full right-0 mt-2 w-60 bg-gray-800 text-white text-sm rounded-lg shadow-lg p-3 z-10">
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-x-8 border-x-transparent border-b-8 border-b-gray-800"></div>
              <h4 className="font-bold border-b border-gray-600 pb-1 mb-2">
                Quiénes están dentro:
              </h4>
              <ul className="list-disc list-inside text-left max-h-48 overflow-y-auto">
                {peopleInsideList.map((name, index) => (
                  <li key={index} className="truncate">
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">
            Opciones de Filtrado
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label
              htmlFor="period-select"
              className="block text-gray-700 text-sm font-medium mb-2 h-10"
            >
              Ver datos por periodo:
            </label>
            <select
              id="period-select"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              <option value="hoy">Hoy</option>
              <option value="8_dias">Últimos 8 Días</option>
              <option value="15_dias">Últimos 15 Días</option>
              <option value="1_mes">Último Mes</option>
              <option value="todo">Toda la Información</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="dashboard-role-select"
              className="block text-gray-700 text-sm font-medium mb-2 h-10"
            >
              Ver datos por rol:
            </label>
            <select
              id="dashboard-role-select"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={selectedDashboardRole}
              onChange={(e) => setSelectedDashboardRole(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value={ROLES.MONITOR}>Solo Monitores</option>
              <option value={ROLES.ESTUDIANTE}>Solo Estudiantes</option>
              <option value={ROLES.DOCENTE}>Solo Docentes</option>
              <option value={ROLES.ADMINISTRATIVO}>Solo Administrativos</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="monitor-select"
              className="block text-gray-700 text-sm font-medium mb-2 h-10"
            >
              Seleccionar Persona para gráficos:
            </label>
            <select
              id="monitor-select"
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={selectedMonitorDoc}
              onChange={(e) => setSelectedMonitorDoc(e.target.value)}
            >
              <option value="all">
                {selectedDashboardRole === "all"
                  ? "Todas las Personas"
                  : `Todos los ${ROLE_NAMES[selectedDashboardRole]}s`}
              </option>
              {monitorDetails
                .filter(
                  (m) =>
                    selectedDashboardRole === "all" ||
                    (m.Rol && m.Rol.toLowerCase() === selectedDashboardRole)
                )
                .map((monitor) => (
                  <option
                    key={monitor.Documento}
                    value={String(monitor.Documento)}
                  >
                    {monitor.Nombre} (Doc: {monitor.Documento}) - {monitor.Rol}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div>
          <label
            htmlFor="search-input"
            className="block text-gray-700 text-sm font-medium mb-2"
          >
            Buscar por nombre:
          </label>
          <input
            type="text"
            id="search-input"
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Escribe un nombre para buscar en los detalles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {registeredData.length === 0 ? (
        <p className="text-gray-600 text-center mt-10">
          No hay datos de registro para mostrar en el dashboard.
        </p>
      ) : (
        <div className="space-y-10">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Horas de Llegada (
              {selectedMonitorDoc === "all"
                ? "General"
                : monitorDetails.find(
                    (m) => String(m.Documento) === selectedMonitorDoc
                  )?.Nombre || ""}
              )
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
              >
                <CartesianGrid />
                <XAxis
                  type="number"
                  dataKey="date"
                  name="Fecha"
                  tickFormatter={formatXAxisDate}
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                />
                <YAxis
                  type="number"
                  dataKey="time"
                  name="Hora"
                  tickFormatter={formatYAxisTime}
                  domain={[0, 24]}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={<CustomTooltip />}
                />
                <Legend />
                <Scatter
                  name="Llegadas"
                  data={filteredArrivalData}
                  fill="#2874A6"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Horas de Salida (
              {selectedMonitorDoc === "all"
                ? "General"
                : monitorDetails.find(
                    (m) => String(m.Documento) === selectedMonitorDoc
                  )?.Nombre || ""}
              )
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
              >
                <CartesianGrid />
                <XAxis
                  type="number"
                  dataKey="date"
                  name="Fecha"
                  tickFormatter={formatXAxisDate}
                  domain={["dataMin", "dataMax"]}
                  scale="time"
                />
                <YAxis
                  type="number"
                  dataKey="time"
                  name="Hora"
                  tickFormatter={formatYAxisTime}
                  domain={[0, 24]}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={<CustomTooltip />}
                />
                <Legend />
                <Scatter
                  name="Salidas"
                  data={filteredDepartureData}
                  fill="#C0392B"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              {selectedDashboardRole === "all"
                ? "Personas por Programa o Cargo"
                : `${ROLE_NAMES[selectedDashboardRole]}s por ${
                    selectedDashboardRole === ROLES.DOCENTE ||
                    selectedDashboardRole === ROLES.ADMINISTRATIVO
                      ? "Cargo"
                      : "Programa"
                  }`}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartDataProgram}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-15}
                  textAnchor="end"
                  interval={0}
                  height={70}
                  style={{ fontSize: 9.4 }}
                />
                <YAxis />
                <Tooltip content={<CustomTooltip isProgramChart={true} />} />
                <Legend />
                <Bar
                  dataKey="Conteo"
                  fill="#5DADE2"
                  name={
                    selectedDashboardRole === "all"
                      ? "Personas"
                      : `${ROLE_NAMES[selectedDashboardRole]}s`
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Distribución de Duración de Estancia (horas)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartDataDuration}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip content={<CustomTooltip isDurationChart={true} />} />
                <Legend />
                <Bar dataKey="Conteo" fill="#82E0AA" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Entradas Diarias
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartDataDailyEntries}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid />
                <XAxis
                  dataKey="date"
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                  height={70}
                  style={{ fontSize: 12 }}
                />
                <YAxis />
                <Tooltip content={<CustomTooltip isDailyChart={true} />} />
                <Legend />
                <Bar
                  dataKey="morningEntries"
                  stackId="a"
                  fill="#BB8FCE"
                  name="Mañana"
                />
                <Bar
                  dataKey="afternoonEntries"
                  stackId="a"
                  fill="#9B59B6"
                  name="Tarde"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Salidas Diarias
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartDataDailyExits}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid />
                <XAxis
                  dataKey="date"
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                  height={70}
                  style={{ fontSize: 12 }}
                />
                <YAxis />
                <Tooltip
                  content={
                    <CustomTooltip isDailyChart={true} isExitChart={true} />
                  }
                />
                <Legend />
                <Bar
                  dataKey="morningExits"
                  stackId="b"
                  fill="#E74C3C"
                  name="Mañana"
                />
                <Bar
                  dataKey="afternoonExits"
                  stackId="b"
                  fill="#C0392B"
                  name="Tarde"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              {selectedDashboardRole === "all"
                ? "Detalle de Todas las Personas"
                : `Detalle de ${ROLE_NAMES[selectedDashboardRole]}s`}
            </h3>
            {monitorDetails.length > 0 ? (
              monitorDetails
                .filter(
                  (m) =>
                    selectedMonitorDoc === "all" ||
                    String(m.Documento) === selectedMonitorDoc
                )
                .map((monitor) => (
                  <div
                    key={monitor.Documento}
                    className="mb-6 border-b pb-4 last:border-b-0"
                  >
                    <h4 className="text-lg font-semibold text-gray-700 mb-2">
                      {monitor.Rol}: {monitor.Nombre} (Doc: {monitor.Documento})
                    </h4>
                    <p className="text-sm text-gray-600">
                      {monitor.Rol === ROLE_NAMES[ROLES.MONITOR] ||
                      monitor.Rol === ROLE_NAMES[ROLES.ESTUDIANTE]
                        ? "Programa: "
                        : "Cargo: "}
                      {monitor.Programa}, Ciudad: {monitor.Ciudad}, Vigencia:{" "}
                      {monitor.Vigencia}, Rol: {monitor.Rol}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Total Entradas (Periodo Seleccionado):{" "}
                      {monitor.TotalEntradasPeriodo}
                    </p>
                    <div className="overflow-x-auto mt-4">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Entrada
                            </th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Salida
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {monitor.Entradas.map((entryTime, entryIndex) => (
                            <tr key={entryIndex}>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                {entryTime}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                {monitor.Salidas[entryIndex]}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-gray-500 text-center mt-4">
                No se encontraron personas con ese nombre.
              </p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default DashboardView;
