import { handleGithubOAuthRequest } from "../../../api/github/oauth";

type GithubOAuthEnv = {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
};

type CloudflarePagesContext = {
  request: Request;
  env: GithubOAuthEnv;
};

export function onRequest(context: CloudflarePagesContext) {
  return handleGithubOAuthRequest(context.request, context.env);
}
