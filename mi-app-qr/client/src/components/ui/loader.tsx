import "./loader.css";

interface LoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Indicador decorativo: el texto o estado accesible lo aporta su contenedor. */
export function Loader({ size = "md", className = "" }: LoaderProps) {
  return (
    <span className={`sq-loader sq-loader--${size} ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function LoadingState({
  label = "Cargando...",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`sq-loading-state ${className}`} role="status" aria-atomic="true">
      <Loader />
      <span>{label}</span>
    </div>
  );
}
