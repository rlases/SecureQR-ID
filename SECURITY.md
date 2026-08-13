# Política de seguridad

## Naturaleza del proyecto

SecureQR-ID es un **prototipo de investigación académica**. Implementa primitivas
criptográficas para validar credenciales y proteger la integridad de registros de acceso,
pero **no ha sido auditado de forma independiente** y no debe desplegarse en un entorno
de producción sin esa auditoría.

## Reporte de vulnerabilidades

Si encuentra una vulnerabilidad, **no abra un issue público**. Escriba a:

- dtorresfi@unadvirtual.edu.co
- jlhernandezcal@unadvirtual.edu.co

Incluya descripción, impacto estimado y pasos de reproducción. Responderemos en un plazo
razonable dado el carácter académico del proyecto.

## Reglas no negociables para quien contribuya

**Material criptográfico.** Ninguna clave privada, certificado, identidad de Fabric o
token real entra al repositorio. Ni siquiera de prueba, ni siquiera temporalmente: el
historial de git es permanente y el `.gitignore` no protege lo que ya fue commiteado.
Si ocurre, la clave se considera comprometida y debe rotarse, no borrarse del historial.

**Datos personales.** El proyecto trata datos identificables de estudiantes y personal,
lo que activa las obligaciones de la Ley 1581 de 2012. Nada de nombres, documentos de
identidad, correos institucionales de terceros ni registros de acceso reales en el
repositorio. Para pruebas se usan datos sintéticos en `data/ejemplo/`.

**Blockchain.** A la red permisionada solo viaja la raíz de Merkle. Si alguna vez un
dato personal —o un hash que permita reidentificación por fuerza bruta sobre un espacio
pequeño, como un número de documento sin sal— llega a la cadena, es irreversible.
Este punto se revisa en cada cambio al módulo `anchor/`.

**Criptografía.** No se implementan primitivas propias. Se usan librerías establecidas
y mantenidas. Cualquier cambio en el esquema de firma, la derivación de nonces o la
construcción del árbol de Merkle exige registrar un ADR en `docs/DECISIONS.md`.

## Alcance de las pruebas de seguridad

Las pruebas de ataque previstas (repetición de tokens, falsificación de firmas,
reemplazo de credenciales, manipulación interna de la bitácora) se ejecutan
**únicamente** contra la instancia de laboratorio del proyecto y, en la fase piloto,
con autorización institucional explícita de la UNAD CCAV Pitalito.
