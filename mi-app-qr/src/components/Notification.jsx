// src/components/Notification.jsx
// src/components/Notification.jsx

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

function Notification({ notification, onClose }) {
  const { message, type, isOpen } = notification;

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  const typeClasses = {
    success: "bg-green-500",
    error: "bg-red-500",
    warning: "bg-orange-500",
    default: "bg-blue-500",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
          className={`fixed top-5 right-5 p-4 rounded-lg shadow-xl text-white z-50 ${
            typeClasses[type] || typeClasses.default
          }`}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Notification;
