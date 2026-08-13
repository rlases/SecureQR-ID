// src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import RegistrationForm from './components/RegistrationForm.jsx';
import DashboardView from './components/DashboardView.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import Notification from './components/Notification.jsx';
import EditRecordModal from './components/EditRecordModal.jsx';
import ExportCsvModal from './components/ExportCsvModal.jsx';
import ForgottenOutModal from './components/ForgottenOutModal.jsx';
import LicenseExpiredScreen from './components/LicenseExpiredScreen.jsx';
import { parseQrUrlData, parseQrTextData } from './utils/qrParser.js';
import { ROLES, ROLE_NAMES } from './constants/appConstants.js';

// Componente para la pantalla de carga inicial
const LoadingScreen = () => (
    <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
            <svg className="animate-spin h-10 w-10 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-lg font-semibold text-gray-700">Verificando licencia...</p>
        </div>
    </div>
);

const playSuccessSound = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioContext.currentTime + 0.01);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1046.50, audioContext.currentTime + 0.1);
    oscillator.start(audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2);
    oscillator.stop(audioContext.currentTime + 0.2);
};

const playErrorSound = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.7, audioContext.currentTime + 0.01);
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.15);
    oscillator.start(audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2);
    oscillator.stop(audioContext.currentTime + 0.2);
};

const formatDuration = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    let result = '';
    if (minutes > 0) result += `${minutes} minuto${minutes > 1 ? 's' : ''}`;
    if (seconds > 0) {
        if (minutes > 0) result += ' y ';
        result += `${seconds} segundo${seconds > 1 ? 's' : ''}`;
    }
    return result || '0 segundos';
};

function App() {
    const [licenseStatus, setLicenseStatus] = useState({ status: null, isLoading: true });
    const [qrInput, setQrInput] = useState('');
    const [statusMessage, setStatusMessage] = useState('Esperando escaneo...');
    const [statusType, setStatusType] = useState('default');
    const [registeredData, setRegisteredData] = useState(() => {
        const savedData = localStorage.getItem('qrRegisters');
        return savedData ? JSON.parse(savedData) : [];
    });
    const [currentView, setCurrentView] = useState('register');
    const [pendingRegistration, setPendingRegistration] = useState(null);
    const [recentRecordsFilter, setRecentRecordsFilter] = useState('all');
    const [forgottenOutState, setForgottenOutState] = useState({ isOpen: false, record: null, newScanData: null });
    const [pendingNewEntryData, setPendingNewEntryData] = useState(null);
    const [modalState, setModalState] = useState({ isOpen: false, title: '', message: '', onConfirm: () => { }, onCancel: () => { } });
    const [notification, setNotification] = useState({ isOpen: false, message: '', type: 'default' });
    const [editModalState, setEditModalState] = useState({ isOpen: false, record: null });
    const [exportCsvModalOpen, setExportCsvModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const filterTimeoutRef = useRef(null);

    useEffect(() => {
        const verifyLicense = async () => {
            if (window.electronAPI && typeof window.electronAPI.checkLicense === 'function') {
                try {
                    const result = await window.electronAPI.checkLicense();
                    setLicenseStatus({ ...result, isLoading: false });
                } catch (error) {
                    console.error("Error al verificar la licencia:", error);
                    setLicenseStatus({ status: 'ERROR', isLoading: false });
                }
            } else {
                console.warn("Entorno de Electron no detectado. Se asume licencia válida para desarrollo.");
                setLicenseStatus({ status: 'VALID', isLoading: false });
            }
        };
        verifyLicense();
    }, []);

    useEffect(() => {
        localStorage.setItem('qrRegisters', JSON.stringify(registeredData));
    }, [registeredData]);

    const showNotification = useCallback((message, type = 'default') => {
        setNotification({ isOpen: true, message, type });
        if (type === 'success') playSuccessSound();
        else if (type === 'error' || type === 'warning') playErrorSound();
    }, []);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.altKey) {
                event.preventDefault();
                switch (event.key.toLowerCase()) {
                    case 'm': setRecentRecordsFilter(ROLES.MONITOR); showNotification(`Mostrando solo ${ROLE_NAMES[ROLES.MONITOR]}s`, 'default'); break;
                    case 'e': setRecentRecordsFilter(ROLES.ESTUDIANTE); showNotification(`Mostrando solo ${ROLE_NAMES[ROLES.ESTUDIANTE]}s`, 'default'); break;
                    case 'd': setRecentRecordsFilter(ROLES.DOCENTE); showNotification(`Mostrando solo ${ROLE_NAMES[ROLES.DOCENTE]}s`, 'default'); break;
                    case 'a': setRecentRecordsFilter(ROLES.ADMINISTRATIVO); showNotification(`Mostrando solo ${ROLE_NAMES[ROLES.ADMINISTRATIVO]}s`, 'default'); break;
                    case 't': setRecentRecordsFilter('all'); showNotification('Mostrando todos los roles', 'default'); break;
                    default: break;
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showNotification]);

    useEffect(() => {
        if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current);
        if (recentRecordsFilter !== 'all') {
            filterTimeoutRef.current = setTimeout(() => {
                setRecentRecordsFilter('all');
                showNotification('Filtro de registros recientes restablecido a "Todos"', 'default');
            }, 60000);
        }
        return () => clearTimeout(filterTimeoutRef.current);
    }, [recentRecordsFilter, showNotification]);

    const updateStatus = useCallback((message, type, extra = {}) => {
        let fullMessage = message;
        if (Object.keys(extra).length > 0) {
            const rol = extra.Rol ? extra.Rol.toLowerCase() : 'desconocido';
            let programaOCargoLabel = "";
            let programaOCargoValue = "";
            if (rol === ROLES.MONITOR || rol === ROLES.ESTUDIANTE) {
                programaOCargoLabel = "Programa";
                programaOCargoValue = extra.Programa || "N/A";
            } else if (rol === ROLES.DOCENTE || rol === ROLES.ADMINISTRATIVO) {
                programaOCargoLabel = "Cargo";
                programaOCargoValue = extra.Cargo || "N/A";
            } else {
                programaOCargoLabel = "Programa/Cargo";
                programaOCargoValue = extra.Programa || extra.Cargo || "N/A";
            }
            fullMessage += `\n   Nombre: ${extra.Nombre || 'N/A'}\n   Documento: ${extra.Documento || 'N/A'}\n   ${programaOCargoLabel}: ${programaOCargoValue}\n   Ciudad: ${extra.Ciudad || 'N/A'}\n   Vigencia: ${extra.Vigencia || 'N/A'}\n   Rol: ${extra.Rol || 'N/A'}`;
        }
        setStatusMessage(fullMessage);
        setStatusType(type);
    }, []);

    useEffect(() => {
        if (pendingRegistration) {
            setStatusMessage(`Usuario nuevo detectado: ${pendingRegistration.Nombre}\nPor favor, selecciona su rol para completar el registro.`);
            setStatusType('warning');
            return;
        }
        const filteredData = registeredData.filter(entry => recentRecordsFilter === 'all' || (entry.Rol && entry.Rol.toLowerCase() === recentRecordsFilter.toLowerCase()));
        if (filteredData.length === 0) {
            const filterName = recentRecordsFilter === 'all' ? 'general' : `de ${ROLE_NAMES[recentRecordsFilter] || 'Desconocido'}s`;
            setStatusMessage(`No hay registros recientes en la vista ${filterName}. Esperando escaneo...`);
            setStatusType('default');
            return;
        }
        const getEventTime = (record) => Math.max(new Date(record.Entrada).getTime(), (record.Salida && record.Salida !== 'None' && record.Salida !== 'nan' ? new Date(record.Salida).getTime() : 0));
        const lastRecord = [...filteredData].sort((a, b) => getEventTime(b) - getEventTime(a))[0];
        const isExit = lastRecord.Salida && lastRecord.Salida !== 'None' && lastRecord.Salida !== 'nan';
        const messagePrefix = isExit ? `👋 Última salida registrada como ${lastRecord.Rol} para:` : `✅ Última entrada registrada como ${lastRecord.Rol} para:`;
        updateStatus(messagePrefix, 'success', lastRecord);
    }, [registeredData, pendingRegistration, recentRecordsFilter, updateStatus]);

    const resetFlow = useCallback(() => {
        setIsSubmitting(false);
        setQrInput('');
        setModalState(prev => ({ ...prev, isOpen: false }));
        setForgottenOutState({ isOpen: false, record: null, newScanData: null });
        setPendingRegistration(null);
        setPendingNewEntryData(null);
    }, []);

    const showModal = useCallback((title, message, onConfirm) => {
        const handleConfirm = () => {
            onConfirm();
            resetFlow();
        };
        const handleCancel = () => {
            resetFlow();
        };
        setModalState({ isOpen: true, title, message, onConfirm: handleConfirm, onCancel: handleCancel });
    }, [resetFlow]);

    const requestAdminAndExecute = async (callback) => {
        if (window.electronAPI) {
            try {
                showNotification('Esperando confirmación del administrador...', 'default');
                const result = await window.electronAPI.requestAdminPrivileges();
                if (result.success) {
                    callback();
                } else {
                    showNotification(result.error || 'La operación fue cancelada por el usuario.', 'warning');
                    resetFlow();
                }
            } catch (error) {
                showNotification('Error al solicitar permisos de administrador.', 'error');
                resetFlow();
            }
        } else {
            callback();
        }
    };

    const completeRegistration = useCallback((data, role) => {
        const dataWithRole = { ...data, Rol: role };
        const existingOpenEntryIndex = registeredData.findIndex(e => e.Documento === dataWithRole.Documento && (!e.Salida || e.Salida === 'None' || e.Salida === 'nan'));

        if (existingOpenEntryIndex !== -1) {
            const existingEntry = registeredData[existingOpenEntryIndex];
            const performCheckout = () => {
                const updatedData = [...registeredData];
                updatedData[existingOpenEntryIndex].Salida = dataWithRole.Entrada;
                setRegisteredData(updatedData);
                showNotification(`Salida registrada para ${dataWithRole.Nombre}.`, 'success');
            };
            const diffMs = new Date().getTime() - new Date(existingEntry.Entrada).getTime();
            if (diffMs < 5 * 60 * 1000) {
                return showModal("Confirmar Salida Rápida", `¿Registrar salida para ${existingEntry.Nombre}?\n\nTiempo transcurrido: ${formatDuration(diffMs)}.`, performCheckout);
            }
            performCheckout();
            resetFlow();
        } else {
            const performCheckIn = () => {
                setRegisteredData(prevData => [...prevData, dataWithRole]);
                showNotification(`Entrada registrada para ${dataWithRole.Nombre}.`, 'success');
            };
            const allRecordsForUser = registeredData.filter(e => e.Documento === data.Documento);
            const lastClosedRecord = allRecordsForUser
                .filter(r => r.Salida && r.Salida !== 'None' && r.Salida !== 'nan')
                .sort((a, b) => new Date(b.Salida) - new Date(a.Salida))[0];

            if (lastClosedRecord) {
                const diffMs = new Date().getTime() - new Date(lastClosedRecord.Salida).getTime();
                if (diffMs < 5 * 60 * 1000) {
                    return showModal("Confirmar Entrada Rápida", `Este usuario registró una salida hace menos de 5 minutos (${formatDuration(diffMs)}).\n\n¿Deseas registrar una nueva entrada de todos modos?`, performCheckIn);
                }
            }
            performCheckIn();
            resetFlow();
        }
    }, [registeredData, showNotification, showModal, resetFlow]);

    const handleRegister = useCallback(async () => {
        if (qrInput.trim() === '' || pendingRegistration || isSubmitting) return;
        setIsSubmitting(true);

        let preParsedResult;
        try {
            const isUrl = qrInput.startsWith('http');
            if (isUrl) {
                let htmlContent;
                if (window.electronAPI) {
                    const result = await window.electronAPI.fetchUrlContent(qrInput);
                    if (result.success) htmlContent = result.data; else throw new Error(result.error);
                } else {
                    const response = await fetch(qrInput);
                    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
                    htmlContent = await response.text();
                }
                preParsedResult = parseQrUrlData(htmlContent);
            } else {
                preParsedResult = parseQrTextData(qrInput);
            }
            if (preParsedResult.type === 'error') throw new Error(preParsedResult.message);

            const { parsedData } = preParsedResult;
            const existingOpenEntryIndex = registeredData.findIndex(e => e.Documento === parsedData.Documento && (!e.Salida || e.Salida === 'None' || e.Salida === 'nan'));

            if (existingOpenEntryIndex !== -1) {
                const existingEntry = registeredData[existingOpenEntryIndex];
                const entryDate = new Date(existingEntry.Entrada);
                const today = new Date();
                if (entryDate.toDateString() !== today.toDateString()) {
                    setForgottenOutState({ isOpen: true, record: existingEntry, newScanData: parsedData });
                    return;
                }
            }

            const existingUserRecords = registeredData.filter(e => e.Documento === parsedData.Documento);
            if (existingUserRecords.length > 0) {
                const lastRecord = existingUserRecords.sort((a, b) => new Date(b.Entrada) - new Date(a.Entrada))[0];
                completeRegistration(parsedData, lastRecord.Rol);
            } else {
                setPendingRegistration(parsedData);
            }

        } catch (error) {
            showNotification(`Error: ${error.message}`, 'error');
            resetFlow();
        }
    }, [qrInput, pendingRegistration, isSubmitting, registeredData, completeRegistration, showNotification, resetFlow]);

    const handleRoleSelectionForNewUser = (role) => {
        if (!pendingRegistration) return;
        completeRegistration(pendingRegistration, role);
        resetFlow();
    };

    const handleLogout = () => {
        showModal("Cerrar Sesión y Borrar Datos", "¿Estás seguro?", () => {
            requestAdminAndExecute(() => {
                setRegisteredData([]);
                localStorage.removeItem('qrRegisters');
                showNotification('Datos eliminados.', 'success');
                setTimeout(() => window.location.reload(), 1500);
            });
        });
    };

    const handleOpenEditModal = (record) => {
        requestAdminAndExecute(() => setEditModalState({ isOpen: true, record }));
    };

    const handleCloseEditModal = () => {
        setEditModalState({ isOpen: false, record: null });
        resetFlow();
    };

    const handleUpdateRecord = (originalRecord, newEntrada, newSalida, newRol) => {
        let updatedData = registeredData.map(rec =>
            (rec.Entrada === originalRecord.Entrada && rec.Documento === originalRecord.Documento)
                ? { ...rec, Entrada: newEntrada, Salida: newSalida, Rol: newRol }
                : rec
        );
        if (originalRecord.Rol !== newRol) {
            updatedData = updatedData.map(rec =>
                (rec.Documento === originalRecord.Documento && new Date(rec.Entrada) >= new Date(originalRecord.Entrada))
                    ? { ...rec, Rol: newRol }
                    : rec
            );
            showNotification(`Rol actualizado para todos los registros de ${originalRecord.Nombre} a partir de esta fecha.`, 'success');
        }
        if (pendingNewEntryData) {
            const newEntryData = { ...pendingNewEntryData, Rol: newRol };
            updatedData.push(newEntryData);
            showNotification(`Nueva entrada registrada para ${newEntryData.Nombre}.`, 'success');
        } else {
            showNotification('Registro actualizado exitosamente.', 'success');
        }
        setRegisteredData(updatedData);
        handleCloseEditModal();
    };

    const handleDeleteRecord = (recordToDelete) => {
        showModal("Confirmar Eliminación", `¿Estás seguro de que quieres eliminar el registro de ${recordToDelete.Nombre}?`, () => {
            requestAdminAndExecute(() => {
                const updatedData = registeredData.filter(rec => !(rec.Entrada === recordToDelete.Entrada && rec.Documento === recordToDelete.Documento));
                setRegisteredData(updatedData);
                showNotification('Registro eliminado.', 'default');
            });
        });
    };

    const triggerCsvExport = () => setExportCsvModalOpen(true);

    const handleCorrectForgottenCheckout = () => {
        const { record, newScanData } = forgottenOutState;
        resetFlow();
        requestAdminAndExecute(() => {
            setPendingNewEntryData(newScanData);
            setEditModalState({ isOpen: true, record: record });
        });
    };

    const handleForceNewEntry = () => {
        const { newScanData } = forgottenOutState;
        resetFlow();
        requestAdminAndExecute(() => {
            const existingUserRecords = registeredData.filter(e => e.Documento === newScanData.Documento);
            const lastRecord = existingUserRecords.sort((a, b) => new Date(b.Entrada) - new Date(a.Entrada))[0];
            const roleToUse = lastRecord.Rol;
            setRegisteredData(prevData => [...prevData, { ...newScanData, Rol: roleToUse }]);
            showNotification(`Nueva entrada forzada para ${newScanData.Nombre}.`, 'success');
        });
    };

    const handleCloseForgottenOutModal = () => {
        resetFlow();
    }

    const handleExportCsv = async (role) => {
        setExportCsvModalOpen(false);
        let dataToExport = registeredData;
        if (role && role !== 'all') {
            dataToExport = registeredData.filter(row => row.Rol && row.Rol.toLowerCase() === role.toLowerCase());
        }
        if (dataToExport.length === 0) {
            const roleName = role === 'all' ? 'todos los roles' : ROLE_NAMES[role] || role;
            return showNotification(`No hay datos para generar el reporte de "${roleName}".`, 'warning');
        }
        const headers = Object.keys(dataToExport[0]);
        const csvContent = [headers.join(','), ...dataToExport.map(row => headers.map(header => {
            let value = row[header];
            if (value === null || value === undefined) value = '';
            else if (typeof value === 'string' && value.includes(',')) value = `"${value}"`;
            return value;
        }).join(','))].join('\n');
        if (window.electronAPI) {
            const fileName = `registro_qr_reporte_${role}.csv`;
            const result = await window.electronAPI.saveCsvDialog(fileName, csvContent);
            if (result.success) showNotification('Archivo CSV guardado.', 'success');
            else if (!result.canceled) showNotification(`Error al guardar: ${result.error}`, 'error');
        } else {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', `registro_qr_reporte_${role}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showNotification('Reporte CSV descargado.', 'success');
        }
    };

    const handleNavigation = (view) => {
        setCurrentView(view);
        if (recentRecordsFilter !== 'all') {
            setRecentRecordsFilter('all');
            showNotification('Filtro de registros recientes restablecido a "Todos"', 'default');
        }
    };

    const renderMainContent = () => {
        if (currentView === 'dashboard') {
            return <DashboardView key="dashboard" registeredData={registeredData} />;
        }
        return (
            <RegistrationForm
                key="registration"
                qrInput={qrInput}
                setQrInput={setQrInput}
                statusMessage={statusMessage}
                statusType={statusType}
                handleRegister={handleRegister}
                generateCsvReport={triggerCsvExport}
                registeredData={registeredData}
                onEdit={handleOpenEditModal}
                onDelete={handleDeleteRecord}
                pendingRegistration={pendingRegistration}
                onRoleSelectForNewUser={handleRoleSelectionForNewUser}
                recentRecordsFilter={recentRecordsFilter}
                isSubmitting={isSubmitting}
                currentView={currentView}
            />
        );
    };

    if (licenseStatus.isLoading) return <LoadingScreen />;
    if (licenseStatus.status !== 'VALID') return <LicenseExpiredScreen status={licenseStatus.status} />;

    return (
        <div className="flex h-screen bg-gray-200 p-8 font-inter">
            <Notification notification={notification} onClose={() => setNotification({ ...notification, isOpen: false })} />
            <ConfirmModal isOpen={modalState.isOpen} title={modalState.title} message={modalState.message} onConfirm={modalState.onConfirm} onCancel={modalState.onCancel} />
            <EditRecordModal isOpen={editModalState.isOpen} record={editModalState.record} onSave={handleUpdateRecord} onCancel={handleCloseEditModal} />
            <ExportCsvModal isOpen={exportCsvModalOpen} onCancel={() => setExportCsvModalOpen(false)} onExport={handleExportCsv} />
            <ForgottenOutModal
                isOpen={forgottenOutState.isOpen}
                record={forgottenOutState.record}
                onCorrect={handleCorrectForgottenCheckout}
                onForce={handleForceNewEntry}
                onCancel={handleCloseForgottenOutModal}
            />

            <div className="flex w-full max-w-7xl mx-auto bg-white rounded-lg shadow-xl overflow-hidden">
                <div className="w-1/4 bg-gradient-to-br from-teal-500 to-teal-700 text-white p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center mb-10">
                            <h1 className="text-2xl font-bold">Registro QR</h1>
                        </div>
                        <div className="bg-white p-2 aspect-square rounded-lg flex items-center justify-center mx-auto mb-8">
                            <img src={process.env.PUBLIC_URL + '/QRealizadoPor.png'} alt="Código QR" className="w-full h-full object-contain" onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/96x96/cccccc/white?text=QR"; }} />
                        </div>
                        <div className="mb-8">
                            <h2 className="text-lg font-semibold mb-4 opacity-80">Menú</h2>
                            <ul className="space-y-3">
                                <li><button className={`w-full text-left py-2 px-3 rounded-md transition duration-200 ${currentView === 'register' ? 'bg-teal-600 font-bold' : 'hover:bg-teal-600'}`} onClick={() => handleNavigation('register')}><span className="text-sm">📝 Registrar</span></button></li>
                                <li><button className={`w-full text-left py-2 px-3 rounded-md transition duration-200 ${currentView === 'dashboard' ? 'bg-teal-600 font-bold' : 'hover:bg-teal-600'}`} onClick={() => handleNavigation('dashboard')}><span className="text-sm">📊 Ver Dashboard</span></button></li>
                            </ul>
                        </div>
                    </div>
                    <div><button className="w-full bg-white text-teal-700 font-bold py-3 px-4 rounded-lg shadow-md hover:bg-gray-100 transition duration-200" onClick={handleLogout}>Cerrar Sesión</button></div>
                </div>
                <div className="w-3/4 relative overflow-hidden">
                    <AnimatePresence mode="wait">
                        {renderMainContent()}
                    </AnimatePresence>
                </div>
                <div className="fixed bottom-4 right-4 flex items-center space-x-2 p-2 bg-gray-100 rounded-lg shadow-sm z-50">
                    <span className="text-sm text-gray-700">Realizado por: Jhunier Libardo Hernandez Calderon</span>
                    <img src={process.env.PUBLIC_URL + '/logoJhunier.png'} alt="Logo Jhunier" className="w-8 h-8 rounded-full object-contain" onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/32x32/cccccc/white?text=Logo"; }} />
                </div>
            </div>
        </div>
    );
}

export default App;
