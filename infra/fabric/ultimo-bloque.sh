#!/usr/bin/env bash
# Imprime en hexadecimal (64 caracteres) el hash del último bloque del canal (ADR-0017,
# punto 7; issue #133). Es lo que se sella cada día en OpenTimestamps: cada bloque
# compromete a los anteriores, así un sello cubre los lotes de todas las instalaciones.
#
# Consulta `GetChainInfo` de `qscc` con `peer channel getinfo`, que solo lee: no emite
# transacciones.
. "$(dirname "$0")/comun.sh"
[ -e "$MARCA" ] || falla "no hay red creada en $FABRIC_HOME"
entorno_org1
info_canal="$(peer channel getinfo -c "$CANAL" 2>/dev/null | sed -n 's/^Blockchain info: //p')"
[ -n "$info_canal" ] || falla "el peer no devolvió la información del canal $CANAL"
python3 - "$info_canal" <<'PY'
import base64, binascii, json, sys
valor = json.loads(sys.argv[1])["currentBlockHash"]
crudo = base64.b64decode(valor, validate=True)
if len(crudo) != 32:
    sys.exit("el hash del último bloque no tiene 32 bytes")
print(binascii.hexlify(crudo).decode())
PY
