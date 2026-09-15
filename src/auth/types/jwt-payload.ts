export interface JwtPayload {
  sub: string;
  email: string;
}

export interface RefreshJwtPayload extends JwtPayload {
  jti: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface RefreshTokenContext extends AuthenticatedUser {
  jti: string;
  refreshToken: string;
}
