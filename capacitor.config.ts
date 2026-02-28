import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.irondominion.app',
    appName: 'Iron Dominion',
    webDir: 'dist',
    server: {
        androidScheme: 'https',
    },
};

export default config;
