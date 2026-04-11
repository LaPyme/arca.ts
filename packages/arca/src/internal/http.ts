import https from "node:https";
import { ArcaTransportError } from "../errors";
import type { ArcaLogger } from "./logger";

const defaultAgent = new https.Agent({
  keepAlive: true,
});

const legacyTlsAgent = new https.Agent({
  keepAlive: true,
  ciphers: "DEFAULT@SECLEVEL=0",
});

type PostXmlOptions = {
  url: string;
  body: string;
  contentType: string;
  soapAction?: string;
  useLegacyTlsSecurityLevel0?: boolean;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  logger?: ArcaLogger;
  service?: string;
  operation?: string;
};

export async function postXml({
  url,
  body,
  contentType,
  soapAction,
  useLegacyTlsSecurityLevel0 = false,
  timeout = 30_000,
  retries = 0,
  retryDelay = 500,
  logger,
  service,
  operation,
}: PostXmlOptions): Promise<string> {
  const totalAttempts = retries + 1;
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      return await postXmlOnce({
        url,
        body,
        contentType,
        soapAction,
        useLegacyTlsSecurityLevel0,
        timeout,
      });
    } catch (error) {
      if (!(error instanceof ArcaTransportError)) {
        throw error;
      }

      if (attempt >= totalAttempts) {
        logger?.error("ARCA transport request failed", {
          service,
          operation,
          url,
          attempt,
          attempts: totalAttempts,
          error,
        });
        throw error;
      }

      const nextAttempt = attempt + 1;
      logger?.warn(
        `Retrying ARCA request after transport failure (attempt ${nextAttempt}/${totalAttempts})`,
        {
          service,
          operation,
          url,
          attempt: nextAttempt,
          attempts: totalAttempts,
          error,
        }
      );
      await delay(retryDelay);
    }
  }

  throw new ArcaTransportError("ARCA HTTP request exhausted retries");
}

async function postXmlOnce({
  url,
  body,
  contentType,
  soapAction,
  useLegacyTlsSecurityLevel0,
  timeout,
}: Required<
  Pick<
    PostXmlOptions,
    "url" | "body" | "contentType" | "useLegacyTlsSecurityLevel0" | "timeout"
  >
> &
  Pick<PostXmlOptions, "soapAction">): Promise<string> {
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

    request.setTimeout(timeout, () => {
      request.destroy(
        new Error(`ARCA HTTP request timed out after ${timeout}ms`)
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
