export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  email: string;
}

export interface ITokenProvider {
  signAccessToken(payload: AccessTokenPayload): string;
  verifyAccessToken(token: string): AccessTokenPayload;
  generateRefreshTokenValue(): string;
  hashRefreshToken(value: string): string;
  refreshTokenExpiresAt(): Date;
}
