import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
export default defineConfig({root:'pages',base:'/alphabet-sparklab/',plugins:[react(),{name:'alphabet-tracking-sdk',generateBundle(){this.emitFile({type:'asset',fileName:'alphabet-tracking.js',source:readFileSync(new URL('./integration/alphabet-tracking.js',import.meta.url),'utf8')});}}],build:{outDir:'../pages-dist',emptyOutDir:true},publicDir:false});
