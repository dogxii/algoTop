const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

type TokenRequestBody = {
  code?: unknown;
  codeVerifier?: unknown;
  redirectUri?: unknown;
};

type GithubTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GithubOAuthEnv = {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

export const config = {
  runtime: "edge",
};

function readEnv(env: GithubOAuthEnv | undefined, name: keyof GithubOAuthEnv) {
  return env?.[name] ?? process.env[name] ?? "";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJsonBody(request: Request) {
  try {
    return (await request.json()) as TokenRequestBody;
  } catch {
    return null;
  }
}

export async function handleGithubOAuthRequest(
  request: Request,
  env?: GithubOAuthEnv,
) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const clientId = readEnv(env, "GITHUB_CLIENT_ID");
  const clientSecret = readEnv(env, "GITHUB_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    return jsonResponse({ error: "github_oauth_not_configured" }, 500);
  }

  const body = await readJsonBody(request);
  const code = getString(body?.code);
  const codeVerifier = getString(body?.codeVerifier);
  const redirectUri = getString(body?.redirectUri);

  if (!code || !codeVerifier || !redirectUri) {
    return jsonResponse({ error: "invalid_oauth_request" }, 400);
  }

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "AlgoTop",
    },
    body: tokenParams,
  });
  const tokenData = (await tokenResponse.json()) as GithubTokenResponse;

  if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
    return jsonResponse(
      {
        error: tokenData.error ?? "token_exchange_failed",
        message: tokenData.error_description,
      },
      400,
    );
  }

  return jsonResponse({
    access_token: tokenData.access_token,
    token_type: tokenData.token_type,
    scope: tokenData.scope,
  });
}

export default handleGithubOAuthRequest;
