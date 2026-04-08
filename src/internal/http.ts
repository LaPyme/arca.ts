import https from "node:https";
import { ArcaTransportError } from "../errors";

const defaultAgent = new https.Agent({
  keepAlive: true,
});

const legacyTlsAgent = new https.Agent({
  keepAlive: true,
  ciphers: "DEFAULT@SECLEVEL=0",
});
const REQUEST_TIMEOUT_MS = 30_000;

type PostXmlOptions = {
  url: string;
  body: string;
  contentType: string;
  soapAction?: string;
  useLegacyTlsSecurityLevel0?: boolean;
};

export async function postXml({
  url,
  body,
  contentType,
  soapAction,
  useLegacyTlsSecurityLevel0 = false,
}: PostXmlOptions): Promise<string> {
  const endpoint = new URL(url);
  const requestBody = Buffer.from(body, "utf8");

  return await new Promise((resolve, reject) => {
    let settled = false;
    const settleResolve = (responseBody: string) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(responseBody);
    };
    const settleReject = (error: ArcaTransportError) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const request = https.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port || undefined,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: "POST",
        agent: useLegacyTlsSecurityLevel0 ? legacyTlsAgent : defaultAgent,
        headers: {
          Accept: "text/xml, application/soap+xml",
          "Content-Length": requestBody.byteLength,
          "Content-Type": contentType,
          ...(soapAction === undefined
            ? {}
            : { SOAPAction: `"${soapAction}"` }),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        const getResponseBody = () => Buffer.concat(chunks).toString("utf8");

        response.on("data", (chunk: Buffer | string) => {
          chunks.push(
            typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk
          );
        });

        response.on("error", (error) => {
          settleReject(
            new ArcaTransportError(
              `ARCA HTTP response stream failed: ${error.message}`,
              {
                cause: error,
                statusCode: response.statusCode,
                responseBody: getResponseBody(),
              }
            )
          );
        });

        response.on("aborted", () => {
          settleReject(
            new ArcaTransportError("ARCA HTTP response was aborted", {
              statusCode: response.statusCode,
              responseBody: getResponseBody(),
            })
          );
        });

        response.on("end", () => {
          const responseBody = getResponseBody();
          const statusCode = response.statusCode ?? 500;
          const responseContentType = Array.isArray(
            response.headers["content-type"]
          )
            ? response.headers["content-type"].join("; ")
            : response.headers["content-type"];

          if (statusCode >= 200 && statusCode < 300) {
            settleResolve(responseBody);
            return;
          }

          // SOAP services commonly return structured fault payloads with HTTP
          // 500. Let higher layers parse those XML faults instead of forcing a
          // transport error here.
          if (isXmlLikeResponse(responseBody, responseContentType)) {
            settleResolve(responseBody);
            return;
          }

          settleReject(
            new ArcaTransportError(
              `ARCA HTTP request failed with status ${statusCode}`,
              {
                statusCode,
                responseBody,
              }
            )
          );
        });
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(
        new Error(`ARCA HTTP request timed out after ${REQUEST_TIMEOUT_MS}ms`)
      );
    });

    request.on("error", (error) => {
      settleReject(
        new ArcaTransportError(`ARCA HTTP request failed: ${error.message}`, {
          cause: error,
        })
      );
    });

    request.write(requestBody);
    request.end();
  });
}

function isXmlLikeResponse(body: string, contentType?: string): boolean {
  const normalizedContentType = contentType?.toLowerCase() ?? "";
  if (
    normalizedContentType.includes("xml") ||
    normalizedContentType.includes("soap")
  ) {
    return true;
  }

  return body.trimStart().startsWith("<");
}
