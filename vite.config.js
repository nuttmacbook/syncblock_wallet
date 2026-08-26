import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        tailwindcss(),
        VitePWA({
        registerType: 'autoUpdate',
        devOptions: { enabled: true },
        manifest: {
            name: 'Syncblock Wallet',
            short_name: 'Syncblock',
            start_url: '/',
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: '#1e3a8a',
            icons: [
            {
                src: '/logo.png',
                sizes: '192x192',
                type: 'image/png'
            },
            {
                src: '/logo.png',
                sizes: '512x512',
                type: 'image/png'
            }
            ]
        }
        })
    ],
    build: {
        rollupOptions: {
            input: {
                main: 'index.html'
            },
        },
    }
});