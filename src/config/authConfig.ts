export const DEFAULT_GOOGLE_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';

export function getGoogleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID;
}

export function getGoogleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET || '';
}

export const GOOGLE_REDIRECT_URI = 'https://antigravity.google/oauth-callback';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
  'https://www.googleapis.com/auth/aicode',
  'openid'
].join(' ');
