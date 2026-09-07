# Habilitación en ARCA

Este paquete **no** te da de alta las credenciales de ARCA. La configuración
oficial de certificados y servicios la seguís haciendo fuera del SDK.

## Antes de usar el SDK

Necesitás CUIT, certificado y clave privada, la relación del certificado con el
servicio **Facturación Electrónica**, y un punto de venta habilitado para web
services. Homologación y producción tienen certificados y puntos de venta
propios.

1. Conseguí un CUIT válido.
2. Generá o recibí un certificado y su clave privada en formato PEM.
3. Autorizá el certificado para el servicio y el entorno de destino.
4. Empezá con `environment: "test"` y pasá a producción solo después de validar
   el flujo de punta a punta.

## Referencias oficiales

- [Índice de documentación de facturación electrónica](https://www.arca.gob.ar/ws/documentacion/ws-factura-electronica.asp)
- [Documentación de WSAA](https://www.afip.gob.ar/ws/documentacion/wsaa.asp)
- [Certificados para pruebas / homologación](https://www.afip.gob.ar/ws/documentacion/certificados.asp)
- [Manual del desarrollador de WSAA](https://www.afip.gob.ar/ws/WSAA/WSAAmanualDev.pdf)
- [Alta de servicios en WSASS](https://www.afip.gob.ar/ws/WSASS/WSASS_como_adherirse.pdf)
- [Manual del desarrollador de WSFE](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)

Las reglas del manual que el SDK codifica están anotadas, en inglés y para
mantenedores, en [docs/external/README.md](./external/README.md).
