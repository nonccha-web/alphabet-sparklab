import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'pages',base:'/alphabet-sparklab/',plugins:[react()],build:{outDir:'../pages-dist',emptyOutDir:true},publicDir:false});
