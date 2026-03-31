// ============================================================
// src/app/api/auth/[...nextauth]/route.ts
// NextAuth.js — OAuth com Salesforce
// ============================================================

import NextAuth, { type NextAuthOptions } from 'next-auth';

const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://test.salesforce.com';

const authOptions: NextAuthOptions = {
  providers: [
    {
      id: 'salesforce',
      name: 'Salesforce',
      type: 'oauth',
      authorization: {
        url: `${SF_LOGIN_URL}/services/oauth2/authorize`,
        params: { scope: 'api id chatter_api refresh_token' },
      },
      token: `${SF_LOGIN_URL}/services/oauth2/token`,
      userinfo: {
        async request({ tokens }) {
          const res = await fetch(`${tokens.instance_url}/services/oauth2/userinfo`, {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          return res.json();
        },
      },
      clientId: process.env.SF_CLIENT_ID,
      clientSecret: process.env.SF_CLIENT_SECRET || '',
      profile(profile) {
        return {
          id: profile.user_id || profile.sub,
          name: profile.name || profile.preferred_username,
          email: profile.email,
          image: profile.picture,
        };
      },
    },
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Salva tokens SF no JWT
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.instanceUrl = (account as Record<string, unknown>).instance_url;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken,
        instanceUrl: token.instanceUrl,
      };
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
