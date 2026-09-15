import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  manifest: {
    name: 'POP X Adapter',
    description: 'Shares meaningful X selections and drafts with your local POP companion.',
    version: '0.4.0',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAr8l3xXLgqME4UMVud+J99aTF99huHAkfMVb1DCvsGnn19FdpjBGcKMXqKf6gV2fiU8NT9jPvDChEy/8svGoz4cvGCMK6H1SByfZJr3lKma9Zg2f5bv2vRwHGTA88pLoew1yTnyF6k7zFP+puFfs0/KokLSn0nJPgfDqpYICJjSBj2BRppZlnBDXmgIYY9xnoBzL/VZnYau3GzeRjSD3y7XTzfY94BE5w13CIIjl6IvAFfylzbQ8+mpwl0wrsz7zSZgB93oYfowWv84ieFXr0G9AyJ5QkStdHiBkshW/mTV2zipG17cO3cNr7Kr4G6QnAWYK1Q9mGhXeLI8NZJVcmGQIDAQAB',
    permissions: ['alarms', 'nativeMessaging'],
    host_permissions: ['https://x.com/*', 'http://127.0.0.1:32145/*'],
    action: { default_title: 'Open POP' },
  },
});
