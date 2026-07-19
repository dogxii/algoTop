import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { handleGithubOAuthRequest } from "./api/github/oauth";

function applyServerEnv(env: Record<string, string>) {
  if (env.GITHUB_CLIENT_ID) {
    process.env.GITHUB_CLIENT_ID = env.GITHUB_CLIENT_ID;
  }
  if (env.GITHUB_CLIENT_SECRET) {
    process.env.GITHUB_CLIENT_SECRET = env.GITHUB_CLIENT_SECRET;
  }
}

function headersFromIncoming(headers: IncomingHttpHeaders) {
  const nextHeaders = new Headers();

  Object.entries(headers).forEach(([key, value]) => {
    if (typeof value === "string") {
      nextHeaders.set(key, value);
    } else if (Array.isArray(value)) {
      nextHeaders.set(key, value.join(", "));
    }
  });

  return nextHeaders;
}

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function githubOAuthDevApi(): Plugin {
  return {
    name: "algotop-github-oauth-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/github/oauth", async (request, response, next) => {
        try {
          const origin = `http://${request.headers.host ?? "127.0.0.1"}`;
          const method = request.method ?? "GET";
          const body =
            method === "GET" || method === "HEAD"
              ? undefined
              : await readRequestBody(request);
          const apiRequest = new Request(new URL(request.url ?? "/", origin), {
            method,
            headers: headersFromIncoming(request.headers),
            body,
          });
          const apiResponse = await handleGithubOAuthRequest(apiRequest);

          response.statusCode = apiResponse.status;
          apiResponse.headers.forEach((value, key) => {
            response.setHeader(key, value);
          });
          response.end(Buffer.from(await apiResponse.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  applyServerEnv(loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), githubOAuthDevApi()],
    server: {
      host: "0.0.0.0",
    },
  };
});
