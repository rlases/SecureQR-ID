import css from "../src/index.css?raw";

// Acuerdo de diseño #55 (issue #130): contraste de .primary-button, escala de pesos
// medium/semibold/bold y fuentes del sistema.

function bloque(selector: string): string {
  const inicio = css.indexOf(`\n${selector} {`);
  expect(inicio).toBeGreaterThan(-1);
  return css.slice(inicio, css.indexOf("}", inicio));
}

describe("estilos de verifier-web", () => {
  it(".primary-button parte de --teal-700", () => {
    expect(bloque(".primary-button")).toMatch(/linear-gradient\(180deg, var\(--teal-700\) 0%/);
  });

  it("los pesos tipográficos son medium, semibold o bold", () => {
    const pesos = new Set([...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => m[1]));
    expect([...pesos].filter((peso) => !["500", "600", "700"].includes(peso))).toEqual([]);
  });

  it("toda variable usada está declarada", () => {
    const declaradas = new Set([...css.matchAll(/(--[\w-]+):/g)].map((m) => m[1]));
    const usadas = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    expect([...usadas].filter((nombre) => !declaradas.has(nombre))).toEqual([]);
  });

  it("no pide fuentes a un proveedor externo ni declara Inter sin empaquetarla", () => {
    expect(css).not.toMatch(/@import|fonts\.googleapis|@font-face/);
    const familias = [...css.matchAll(/font-family:([^;]+);/g)].map((m) => m[1]);
    expect(familias.length).toBeGreaterThan(0);
    expect(familias.filter((familia) => /\bInter\b/.test(familia))).toEqual([]);
  });
});
