# CLI

El paquete trae un comando, `facturas`, para la parte más difícil del primer
comprobante: las habilitaciones de ARCA. Genera la clave y el CSR, prueba cada
capa en orden y nombra la que falla, con la página y la acción exactas.

```sh
npx facturas init      # clave privada y CSR, más los pasos exactos en ARCA
npx facturas check     # prueba cada capa en orden y nombra la que falla
npx facturas issue     # una factura de ARS 1 en homologación, solo a pedido
npx facturas --help
npx facturas --version
```

Necesitás Node.js 20 o superior. No instala nada aparte del paquete.

## Qué guarda y qué nunca hace

- `init` y `check` **nunca escriben en ARCA**. Solo leen.
- Lo único que el CLI guarda, aparte de los archivos de `init`, es el **ticket
  WSAA**: en `<temporal del sistema>/facturas-cli`, con el directorio en `0700`
  y los archivos en `0600`. ARCA rechaza un segundo login mientras hay un
  ticket vigente (`coe.alreadyAuthenticated`, hasta 12 horas), así que sin ese
  archivo no podrías correr `check` dos veces ni encadenar `check` con `issue`.
  Con `--no-cache` el CLI no lee ni escribe nada: pide un ticket nuevo y lo usa
  solo en memoria.
- No hay archivo de configuración, ni telemetría, ni ningún otro dato guardado.
- Nunca imprime el contenido de un PEM, un token, una firma ni un CMS. Los
  errores que no están en la tabla salen con el mensaje seguro del SDK.
- `issue` **sí escribe** en ARCA: emite un comprobante real de homologación. Se
  niega fuera de `test`.

## `init`

Genera una clave privada RSA 2048 en PKCS#8 sin cifrar y el CSR que se sube en
ARCA. El subject es el que pide el instructivo oficial:
`C=AR, O=<organización>, CN=<alias>, serialNumber=CUIT <cuit>`, con un espacio
literal después de `CUIT`.

```sh
npx facturas init --cuit 20123456789 --env test
```

Sin flags y en una terminal, pregunta el CUIT y el entorno.

| Flag | Por defecto | Qué hace |
| --- | --- | --- |
| `--cuit <cuit>` | pregunta | CUIT de 11 dígitos |
| `--env <test\|production>` | pregunta | Entorno de destino |
| `--name <alias>` | `facturas` | Common name del CSR |
| `--org <razón social>` | el CUIT | Organización del CSR |
| `--dir <directorio>` | el actual | Dónde escribir los archivos |
| `--force` | — | Sobrescribe los archivos existentes |

Escribe `arca-<entorno>.key` con permisos `0600` y `arca-<entorno>.csr`. Si ya
existe alguno, se niega y sale con código 1; `--force` los pisa. Si hay un
`.gitignore` en el directorio, le agrega `arca-*.key` y `arca-*.crt` una sola
vez y te lo dice. En Windows los permisos `0600` no se aplican: guardá la clave
fuera del repositorio.

Sin terminal (CI, scripts), `--cuit` y `--env` son obligatorios; si faltan, sale
con código 2.

Después imprime los pasos exactos en ARCA. Los nombres de las páginas están
verificados contra las referencias oficiales que lista
[Habilitación en ARCA](./habilitacion-arca.md):

| Dónde | Homologación | Producción |
| --- | --- | --- |
| Ingreso | [Clave fiscal](https://auth.afip.gob.ar/contribuyente_/login.xhtml) | igual |
| Subir el CSR | `WSASS - Autogestión Certificados Homologación` → `Nuevo Certificado` | `Administración de Certificados Digitales` → `Agregar alias` |
| Autorizar `wsfe` | el mismo WSASS → `Crear autorización a servicio` | `Administrador de Relaciones` → `Nueva Relación` → `WebServices` → `Facturación Electrónica` |
| Punto de venta | `Administración de Puntos de Venta y Domicilios` | igual |

El sistema del punto de venta depende de tu condición: `RECE para aplicativo y
Web Services` para responsable inscripto, y las opciones
`Factura Electrónica – Monotributo – Web Services` o
`Factura Electrónica – Exento en IVA – Web Services` para monotributo y exento.
`Comprobantes en línea` es otro sistema y no sirve para web services.

## `check`

Lee la configuración igual que `createArcaClient()`: variables de entorno
primero, y los flags ganan. Prueba las capas en orden y para en la primera que
falla.

```sh
export ARCA_TAX_ID=20123456789
export ARCA_ENVIRONMENT=test
export ARCA_CERTIFICATE_PEM="$(cat arca-test.crt)"
export ARCA_PRIVATE_KEY_PEM="$(cat arca-test.key)"
npx facturas check
```

```
✓ variables de entorno   ARCA_TAX_ID, ARCA_ENVIRONMENT=test
✓ certificado y clave    coinciden, vence 2027-09-05
✓ WSAA                   ticket obtenido
✓ WSFE                   servidor ok
✓ puntos de venta        1 informado
  3 (habilitado, CAE)
```

| Flag | Qué hace |
| --- | --- |
| `--cert <archivo>` | Lee el certificado PEM de un archivo, en vez de `ARCA_CERTIFICATE_PEM` |
| `--key <archivo>` | Lee la clave PEM de un archivo, en vez de `ARCA_PRIVATE_KEY_PEM` |
| `--tax-id <cuit>` | CUIT, en vez de `ARCA_TAX_ID` |
| `--env <test\|production>` | Entorno, en vez de `ARCA_ENVIRONMENT` |
| `--sales-point <n>` | Verifica ese punto de venta en particular |
| `--no-cache` | No reusa ni guarda el ticket WSAA: un login forzado, solo en memoria |

Las capas, en orden:

| # | Capa | Qué corre |
| --- | --- | --- |
| 1 | `variables de entorno` | Descubre y valida la configuración del cliente |
| 2 | `certificado y clave` | Parsea los dos PEM, verifica que la clave sea la del certificado y lee el vencimiento |
| 3 | `WSAA` | Un login para el servicio `wsfe`. Reusa el ticket guardado si sigue vigente: la línea dice `ticket obtenido` o `ticket vigente` |
| 4 | `WSFE` | `getServerStatus()` y después `getSalesPoints()` |
| 5 | `puntos de venta` | La lista del paso 4, y el `--sales-point` si lo pasaste |

Hay dos advertencias que no son fallas y mantienen el código de salida 0: un
certificado que vence en menos de 30 días, y una lista de puntos de venta vacía
en homologación, donde ARCA muchas veces no los informa aunque funcionen. En
ese caso un `--sales-point` que no figura en la lista sale como
`3 (no informado)` y `issue` puede seguir; en producción, sí es una falla.

### Diagnósticos

Cada falla que el CLI sabe nombrar tiene exactamente una fila. Es la tabla
completa:

| Capa | Caso | Diagnóstico | Solución |
| --- | --- | --- | --- |
| variables de entorno | falta `ARCA_TAX_ID` | Falta el CUIT. | `export ARCA_TAX_ID=20123456789` |
| variables de entorno | falta `ARCA_ENVIRONMENT` | Falta el entorno. | `export ARCA_ENVIRONMENT=test` |
| variables de entorno | falta un PEM | Falta el certificado o la clave. | Pasá `--cert` y `--key`, o definí `ARCA_CERTIFICATE_PEM` y `ARCA_PRIVATE_KEY_PEM`. |
| certificado y clave | el PEM no parsea | El archivo no es un PEM válido. | Revisá que copiaste el bloque completo, con BEGIN y END. |
| certificado y clave | la clave no es la del certificado | La clave privada no corresponde a este certificado. | Usá la clave con la que generaste el CSR (`arca-<entorno>.key`). |
| certificado y clave | vencido | El certificado venció el `<fecha>`. | Generá un CSR nuevo con `npx facturas init` y renovalo en ARCA. |
| WSAA | `cms.cert.expired` | El certificado venció. | idem |
| WSAA | `cms.cert.untrusted`, `cms.cert.invalid` | ARCA no reconoce este certificado en este entorno. | Homologación y producción tienen certificados propios; revisá `ARCA_ENVIRONMENT`. |
| WSAA | `cms.bad`, `cms.sign.invalid` | La firma del pedido no es válida. | La clave no corresponde al certificado, o el PEM está truncado. |
| WSAA | `coe.notAuthorized` | El certificado no está autorizado para `wsfe`. | `WSASS - Autogestión Certificados Homologación` → `Crear autorización a servicio` (homologación) / `Administrador de Relaciones` (producción). |
| WSAA | `coe.alreadyAuthenticated` | Ya hay un ticket vigente para este certificado. | Otro proceso o máquina tiene el ticket vigente. Esperá hasta 12 horas, o corré `check` desde donde lo pediste. |
| WSAA | `xml.generationTime.invalid`, `xml.expirationTime.*` | La hora de tu máquina difiere de la de ARCA. | Sincronizá el reloj (NTP) y volvé a probar. |
| WSAA | falla de transporte | No se pudo conectar con `<host>`. | Revisá red, proxy o firewall; ARCA homologación suele caerse los fines de semana. |
| WSFE | `reason: missing_relationship` | El certificado no tiene la relación con Facturación Electrónica. | `Administrador de Relaciones` → `Nueva Relación` → `WebServices` → `Facturación Electrónica`. |
| WSFE | `reason: unauthorized_computer` | El certificado o computador no está autorizado. | Verificá que el alias esté asociado al servicio en este entorno. |
| WSFE | `reason: invalid_token` | El ticket fue rechazado. | Volvé a ejecutar `check`; si persiste, revisá el reloj. |
| WSFE | `reason: authentication_rejected` | ARCA denegó el acceso al servicio. | Revisá entorno y relación del certificado. |
| WSFE | otro error de servicio o SOAP fault | ARCA respondió con un error: `<mensaje>`. | — |
| puntos de venta | el `--sales-point` no está en la lista | El punto de venta `<n>` no está habilitado para web services. | ARCA → `Administración de Puntos de Venta y Domicilios` → Nuevo → el sistema de web services de tu condición. |
| puntos de venta | está pero bloqueado | El punto de venta `<n>` está bloqueado. | Revisalo en ARCA. |

Cualquier otro error sale con el mensaje seguro del SDK y su código estable.
Las clases de error están en [Errores](./errores.md).

### `--json`

`check` e `issue` aceptan `--json`. `check` imprime un solo objeto; las capas a
las que no llegó no aparecen.

```json
{
  "ok": false,
  "environment": "test",
  "taxId": "20123456789",
  "layers": [
    { "name": "env", "ok": true, "detail": "ARCA_TAX_ID, ARCA_ENVIRONMENT=test" },
    { "name": "certificate", "ok": true, "detail": "coinciden, vence 2027-09-05", "expiresAt": "2027-09-05" },
    { "name": "wsaa", "ok": true, "detail": "ticket vigente" },
    {
      "name": "wsfe",
      "ok": false,
      "code": "ARCA_AUTHENTICATION_ERROR",
      "reason": "missing_relationship",
      "diagnosis": "El certificado no tiene la relación con Facturación Electrónica.",
      "fix": "Administrador de Relaciones → Nueva Relación → WebServices → Facturación Electrónica."
    }
  ],
  "salesPoints": [{ "number": 3, "blocked": false, "system": "CAE" }]
}
```

`issue --json` imprime el resultado tal como lo devuelve `issue()` del SDK, sin
evidencia cruda.

## `issue`

Emite **una** factura de ARS 1 en homologación, para probar el circuito
completo. Se niega si `ARCA_ENVIRONMENT` no es `test`. Corre antes las capas de
`check` y no sigue si alguna falla.

```sh
npx facturas issue --sales-point 3 --issuer monotributo
```

```
✓ factura C 0003-00000007   CAE 74123456789012   vence 2026-09-16   ARS 1,00

Esta es la llamada que hizo el CLI. Pegala en tu aplicación:

  const factura = await arca.issue({
    issuer: "monotributo",
    salesPoint: 3,
    to: { condition: "consumidor_final" },
    items: [{ amount: 100 }],
  });
```

Acepta los flags de `check`, incluido `--no-cache`, más `--issuer`, con las
cuatro condiciones de emisor: `monotributo`, `responsable_inscripto`, `exento` y `no_alcanzado`. En
una terminal pregunta el punto de venta y el emisor si no los pasaste.

Emite sin `store` y sin `idempotencyKey`: es el inicio rápido en un comando. En
tu aplicación real, configurá los dos, como explica
[Inicio rápido](./inicio-rapido.md#6-hacé-seguros-los-reintentos).

Los otros tres resultados salen con código 1: `rejected` lista los errores de
ARCA uno por línea, e `indeterminate` y `conflict` muestran el número y la
evidencia con el consejo de
[Inicio rápido](./inicio-rapido.md#5-tratá-todos-los-resultados).

## Códigos de salida

| Código | Significado |
| --- | --- |
| `0` | Todo bien. Las advertencias no lo cambian. |
| `1` | Falló una capa, o el comprobante no quedó autorizado. |
| `2` | Error de uso: comando u opción desconocida, o falta un valor obligatorio sin terminal. |

## Colores

El CLI usa ANSI solo cuando la salida es una terminal. Se apaga con
`--no-color` o con la variable `NO_COLOR`. El color va únicamente en las marcas
`✓`, `✗` y `!`.
