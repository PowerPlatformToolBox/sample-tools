import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import type { Plugin } from 'vite';

/**
 * Plugin to fix HTML for PPTB compatibility
 * Removes type="module" and crossorigin attributes since we're using IIFE format
 */
function fixHtmlForPPTB(): Plugin {
    return {
        name: 'fix-html-for-pptb',
        enforce: 'post',
        transformIndexHtml(html) {
            // Remove type="module" and crossorigin from script tags
            // IIFE format doesn't need module type, and file:// URLs don't need crossorigin
            html = html.replace(/\s*type="module"/g, '');
            html = html.replace(/\s*crossorigin/g, '');
            // Clean up extra spaces around attributes
            html = html.replace(/\s+>/g, '>');
            return html;
        },
    };
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue(), fixHtmlForPPTB()],
    base: './',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        rollupOptions: {
            output: {
                // Use IIFE format for compatibility with iframe srcdoc loading
                // ES modules can have issues when loaded via file:// URLs in iframes
                format: 'iife',
                // Bundle everything into a single file to avoid module loading issues
                inlineDynamicImports: true,
                // Disable chunking since we're bundling everything
                manualChunks: undefined,
            },
        },
    },
});
